import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { instance } from '$lib/server/instance';
import { CHANGE_TABLES } from '$lib/types';

/** Test-only: wipe all list data. Enabled only when LIST_TEST_RESET=1. */
export const POST: RequestHandler = async () => {
	if (env.LIST_TEST_RESET !== '1') throw error(404, 'not found');
	const { db } = await instance();
	const tx = db.transaction(() => {
		for (const t of CHANGE_TABLES) db.exec(`DELETE FROM ${t}`);
		db.exec(`DELETE FROM ops_applied`);
		db.prepare(`UPDATE meta SET value = '0' WHERE key = 'rev'`).run();
	});
	tx();
	return json({ ok: true });
};
