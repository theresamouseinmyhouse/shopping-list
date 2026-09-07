import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { instance } from '$lib/server/instance';
import { checkPassword, issueSession, loginRateOk, loginRateReset } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const ip = request.headers.get('cf-connecting-ip') ?? getClientAddress();
	if (!loginRateOk(ip)) {
		return json({ error: 'too_many_attempts' }, { status: 429 });
	}

	let password = '';
	try {
		({ password } = await request.json());
	} catch {
		return json({ error: 'bad_request' }, { status: 400 });
	}
	if (typeof password !== 'string' || !password) {
		return json({ error: 'bad_request' }, { status: 400 });
	}

	const { db, secret } = await instance();
	if (!(await checkPassword(db, password))) {
		return json({ error: 'invalid' }, { status: 401 });
	}

	loginRateReset(ip);
	issueSession(cookies, request, secret);
	return json({ ok: true });
};
