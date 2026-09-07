import Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations';

export type DB = Database.Database;

/** Open a database at `path` (':memory:' for tests), apply pragmas + migrations. */
export function openDb(path: string): DB {
	const db = new Database(path);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('synchronous = NORMAL');
	db.pragma('busy_timeout = 5000');
	migrate(db);
	return db;
}

function migrate(db: DB): void {
	db.exec(
		`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`
	);
	const done = new Set<string>(
		db
			.prepare(`SELECT name FROM schema_migrations`)
			.all()
			.map((r) => (r as { name: string }).name)
	);
	const run = db.transaction((m: { name: string; sql: string }) => {
		db.exec(m.sql);
		db.prepare(`INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)`).run(
			m.name,
			Date.now()
		);
	});
	for (const m of MIGRATIONS) {
		if (!done.has(m.name)) run(m);
	}
}

/** Bump and return the global monotonic revision counter. Call once per mutating op. */
export function nextRev(db: DB): number {
	const row = db
		.prepare(`UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'rev' RETURNING value`)
		.get() as { value: string };
	return Number(row.value);
}

export function currentRev(db: DB): number {
	const row = db.prepare(`SELECT value FROM meta WHERE key = 'rev'`).get() as { value: string };
	return Number(row.value);
}

export function getMeta(db: DB, key: string): string | null {
	const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
		| { value: string }
		| undefined;
	return row ? row.value : null;
}

export function setMeta(db: DB, key: string, value: string): void {
	db.prepare(
		`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
	).run(key, value);
}

// ---------------------------------------------------------------------------
// App singleton. Tests call openDb(':memory:') directly and never touch this.
// ---------------------------------------------------------------------------
let _appDb: DB | null = null;

export function appDb(): DB {
	if (!_appDb) {
		const path = process.env.LIST_DB_PATH ?? 'data/list.db';
		_appDb = openDb(path);
	}
	return _appDb;
}
