import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { instance } from '$lib/server/instance';
import {
	MIN_PASSWORD_LEN,
	issueSession,
	loginRateOk,
	needsSetup,
	setInitialPassword
} from '$lib/server/auth';

/** First-run: pick the shared password. Only works while none is set; logs you in. */
export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const ip = request.headers.get('cf-connecting-ip') ?? getClientAddress();
	if (!loginRateOk(ip)) {
		return json({ error: 'too_many_attempts' }, { status: 429 });
	}

	const { db, secret } = await instance();
	if (!needsSetup(db)) {
		return json({ error: 'already_set' }, { status: 409 });
	}

	let password = '';
	try {
		({ password } = await request.json());
	} catch {
		return json({ error: 'bad_request' }, { status: 400 });
	}
	if (typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
		return json({ error: 'too_short' }, { status: 400 });
	}

	if (!(await setInitialPassword(db, password))) {
		return json({ error: 'already_set' }, { status: 409 });
	}
	issueSession(cookies, request, secret);
	return json({ ok: true });
};
