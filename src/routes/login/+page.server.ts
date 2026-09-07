import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { instance } from '$lib/server/instance';
import { needsSetup } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.authed) throw redirect(303, '/');
	const { db } = await instance();
	return { needsSetup: needsSetup(db) };
};
