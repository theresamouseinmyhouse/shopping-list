import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { instance } from '$lib/server/instance';

export const GET: RequestHandler = async () => {
	await instance(); // ensures the DB opened and migrated
	return text('ok');
};
