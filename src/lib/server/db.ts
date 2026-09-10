import Database from 'better-sqlite3';
import { generateKeyBetween } from 'fractional-indexing';
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
	flattenPlacements(db);
	return db;
}

/**
 * Sections were removed (2026-09-10) — the list is now one flat, drag-ordered
 * sequence per place. This runs once per DB: rank each place's items by their old
 * (section order, position), unsectioned last, re-key them with clean fractional
 * indices, then drop `placements.section_id` and the `sections` / `section_order`
 * tables. Idempotent via the `placements_flat` meta flag.
 */
function flattenPlacements(db: DB): void {
	if (getMeta(db, 'placements_flat') === '1') return;

	const hasSectionId = !!db
		.prepare(`SELECT 1 FROM pragma_table_info('placements') WHERE name = 'section_id'`)
		.get();

	if (hasSectionId) {
		type P = { item_id: string; scope_place_id: string; section_id: string; position: string };
		const placements = db.prepare(`SELECT * FROM placements`).all() as P[];

		const sectionOrder = new Map<string, string>(); // `${scope}\u001f${secId}` -> position
		for (const r of db
			.prepare(`SELECT scope_place_id, section_id, position FROM section_order`)
			.all() as { scope_place_id: string; section_id: string; position: string }[]) {
			sectionOrder.set(`${r.scope_place_id}\u001f${r.section_id}`, r.position);
		}
		const liveSection = new Set(
			(db.prepare(`SELECT id FROM sections WHERE deleted_at IS NULL`).all() as { id: string }[]).map(
				(r) => r.id
			)
		);
		const secPos = (scope: string, sec: string): string => {
			if (!sec || !liveSection.has(sec)) return '￿';
			return (
				sectionOrder.get(`${scope}\u001f${sec}`) ??
				sectionOrder.get(`\u001f${sec}`) ??
				'￾'
			);
		};

		const byScope = new Map<string, P[]>();
		for (const p of placements) {
			if (!byScope.has(p.scope_place_id)) byScope.set(p.scope_place_id, []);
			byScope.get(p.scope_place_id)!.push(p);
		}

		const upd = db.prepare(`UPDATE placements SET position = ?, rev = ? WHERE item_id = ? AND scope_place_id = ?`);
		const tx = db.transaction(() => {
			for (const [scope, items] of byScope) {
				items.sort((a, b) => {
					const sa = secPos(scope, a.section_id);
					const sb = secPos(scope, b.section_id);
					return sa < sb ? -1 : sa > sb ? 1 : a.position < b.position ? -1 : a.position > b.position ? 1 : a.item_id < b.item_id ? -1 : 1;
				});
				let key: string | null = null;
				for (const p of items) {
					key = generateKeyBetween(key, null);
					upd.run(key, nextRev(db), p.item_id, scope);
				}
			}
		});
		tx();

		db.exec(`ALTER TABLE placements DROP COLUMN section_id`);
	}

	db.exec(`DROP TABLE IF EXISTS section_order`);
	db.exec(`DROP TABLE IF EXISTS sections`);
	setMeta(db, 'placements_flat', '1');
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
