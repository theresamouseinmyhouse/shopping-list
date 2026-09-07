import { env } from '$env/dynamic/private';
import { appDb, getMeta, setMeta, type DB } from './db';
import { ensurePasswordSeeded, randomSecret } from './auth';

let ready: Promise<{ db: DB; secret: string }> | null = null;

/** Lazily open the DB, seed the shared password, and resolve the session secret. */
export function instance(): Promise<{ db: DB; secret: string }> {
	if (!ready) ready = init();
	return ready;
}

async function init() {
	const db = appDb();
	await ensurePasswordSeeded(db, env.LIST_PASSWORD?.trim() || undefined);

	// Prefer an explicit secret from the container env; otherwise persist a generated
	// one so sessions survive restarts even if the operator never set LIST_SECRET.
	let secret = env.LIST_SECRET?.trim() || getMeta(db, 'session_secret') || '';
	if (!secret) {
		secret = randomSecret();
		setMeta(db, 'session_secret', secret);
	}
	return { db, secret };
}
