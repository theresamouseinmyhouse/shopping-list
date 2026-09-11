import { fail } from '@sveltejs/kit';
import { instance } from '$lib/server/instance';
import { getAiConfig, setAiConfig, changePassword } from '$lib/server/settings';
import { MIN_PASSWORD_LEN } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { db } = await instance();
	const cfg = getAiConfig(db);
	// never send the real key to the client — just whether one is set
	return {
		ai: { enabled: cfg.enabled, hasKey: !!cfg.apiKey, model: cfg.model, extraInstructions: cfg.extraInstructions }
	};
};

export const actions: Actions = {
	ai: async ({ request }) => {
		const { db } = await instance();
		const fd = await request.formData();
		const enabled = fd.has('enabled');
		const newKey = String(fd.get('apiKey') ?? '').trim();
		const model = String(fd.get('model') ?? '').trim();
		const extraInstructions = String(fd.get('extraInstructions') ?? '');
		setAiConfig(db, {
			enabled,
			model,
			extraInstructions,
			// blank means "leave the existing key alone" — turn AI off to remove one
			...(newKey ? { apiKey: newKey } : {})
		});
		return { aiSaved: true };
	},
	password: async ({ request }) => {
		const { db } = await instance();
		const fd = await request.formData();
		const current = String(fd.get('current') ?? '');
		const next = String(fd.get('next') ?? '');
		const confirm = String(fd.get('confirm') ?? '');
		if (next.length < MIN_PASSWORD_LEN)
			return fail(400, { pwError: `Use at least ${MIN_PASSWORD_LEN} characters.` });
		if (next !== confirm) return fail(400, { pwError: 'Passwords don’t match.' });
		const result = await changePassword(db, current, next);
		if (result === 'wrong-current') return fail(400, { pwError: 'Current password is wrong.' });
		return { pwSaved: true };
	}
};
