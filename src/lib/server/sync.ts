import { nextRev, currentRev, type DB } from './db';
import {
	GLOBAL,
	CHANGE_TABLES,
	normalizeName,
	type ChangeSet,
	type Op,
	type PlaceScope,
	type PlacementRow
} from '../types';
import { nameVariants } from '../quantity';

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/** Apply a batch of ops atomically. Idempotent per op id. */
export function applyOps(db: DB, ops: Op[]): void {
	const tx = db.transaction((list: Op[]) => {
		for (const o of list) applyOne(db, o);
	});
	tx(ops);
}

function alreadyApplied(db: DB, opId: string): boolean {
	return !!db.prepare(`SELECT 1 FROM ops_applied WHERE op_id = ?`).get(opId);
}

function markApplied(db: DB, op: Op): void {
	db.prepare(`INSERT INTO ops_applied (op_id, applied_at) VALUES (?, ?)`).run(op.id, Date.now());
}

function applyOne(db: DB, op: Op): void {
	if (alreadyApplied(db, op.id)) return;
	const handler = (handlers as Record<string, Handler<Op['type']> | undefined>)[op.type];
	if (handler) {
		handler(db, op as never);
	} else {
		// A stale client (e.g. one still on the pre-sections-removal build) may send an
		// op this server no longer knows. Skip it rather than 500 the whole sync batch,
		// but mark it applied so it never blocks the client's outbox.
		console.warn(`sync: ignoring unknown op type "${op.type}" (${op.id})`);
	}
	markApplied(db, op);
}

type Handler<T extends Op['type']> = (db: DB, op: Extract<Op, { type: T }>) => void;
type Handlers = { [T in Op['type']]: Handler<T> };

/**
 * Find a live catalog item whose name (or a singular/plural variant) matches `name`,
 * preferring an exact normalized hit. Shared by `add_item` and the recipe module.
 */
export function matchCatalogItem(db: DB, name: string): string | null {
	const norm = normalizeName(name);
	const norms = [...new Set(nameVariants(name).map(normalizeName))].filter(Boolean);
	if (!norms.length) return null;
	const hits = db
		.prepare(
			`SELECT id, name_norm FROM items
			 WHERE deleted_at IS NULL AND name_norm IN (${norms.map(() => '?').join(',')})`
		)
		.all(...norms) as { id: string; name_norm: string }[];
	const hit = hits.find((h) => h.name_norm === norm) ?? hits[0];
	if (hit) return hit.id;

	// fall back to the alias table ("granulated sugar" -> the "sugar" item)
	const alias = db
		.prepare(
			`SELECT a.item_id FROM item_aliases a JOIN items i ON i.id = a.item_id
			 WHERE i.deleted_at IS NULL AND a.alias_norm IN (${norms.map(() => '?').join(',')}) LIMIT 1`
		)
		.get(...norms) as { item_id: string } | undefined;
	return alias ? alias.item_id : null;
}

function getPlacement(db: DB, itemId: string, scope: PlaceScope): PlacementRow | undefined {
	return db
		.prepare(`SELECT * FROM placements WHERE item_id = ? AND scope_place_id = ?`)
		.get(itemId, scope) as PlacementRow | undefined;
}

const handlers: Handlers = {
	add_place(db, op) {
		const rev = nextRev(db);
		db.prepare(
			`INSERT INTO places (id, name, position, rev, deleted_at) VALUES (?, ?, ?, ?, NULL)
			 ON CONFLICT(id) DO UPDATE SET name = excluded.name, position = excluded.position,
			   deleted_at = NULL, rev = excluded.rev`
		).run(op.place_id, op.name.trim(), op.position, rev);
	},
	rename_place(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE places SET name = ?, rev = ? WHERE id = ?`).run(op.name.trim(), rev, op.place_id);
	},
	delete_place(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE places SET deleted_at = ?, rev = ? WHERE id = ?`).run(op.ts, rev, op.place_id);
	},
	move_place(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE places SET position = ?, rev = ? WHERE id = ?`).run(op.position, rev, op.place_id);
	},

	add_item(db, op) {
		const norm = normalizeName(op.name);
		let row = db.prepare(`SELECT * FROM items WHERE id = ?`).get(op.item_id) as
			| { id: string; deleted_at: number | null }
			| undefined;
		if (!row) {
			const hitId = matchCatalogItem(db, op.name);
			if (hitId) row = { id: hitId, deleted_at: null };
		}
		if (!row) {
			const rev = nextRev(db);
			db.prepare(
				`INSERT INTO items (id, name, name_norm, note, is_staple, rev, deleted_at)
				 VALUES (?, ?, ?, ?, 0, ?, NULL)`
			).run(op.item_id, op.name.trim(), norm, op.note ?? '', rev);
			row = { id: op.item_id, deleted_at: null };
		} else if (row.deleted_at) {
			const rev = nextRev(db);
			db.prepare(`UPDATE items SET deleted_at = NULL, rev = ? WHERE id = ?`).run(rev, row.id);
		}
		const itemId = row.id;

		const scope = op.scope_place_id;
		const addQty = Math.max(1, Math.round(op.qty ?? 1));
		const rev = nextRev(db);
		const ls = db
			.prepare(`SELECT on_list, qty, scope_place_id FROM list_state WHERE item_id = ?`)
			.get(itemId) as { on_list: 0 | 1; qty: number; scope_place_id: string } | undefined;
		if (ls) {
			const qty = ls.on_list ? ls.qty + addQty : addQty;
			// re-adding from "All" keeps the item's remembered home store; adding from
			// inside a store (re)homes it there.
			const nextScope = scope === GLOBAL ? ls.scope_place_id : scope;
			db.prepare(
				`UPDATE list_state SET on_list = 1, checked = 0, checked_at = 0, qty = ?, added_at = ?, scope_place_id = ?, rev = ?
				 WHERE item_id = ?`
			).run(qty, op.ts, nextScope, rev, itemId);
		} else {
			db.prepare(
				`INSERT INTO list_state (item_id, on_list, checked, checked_at, qty, added_at, scope_place_id, rev)
				 VALUES (?, 1, 0, 0, ?, ?, ?, ?)`
			).run(itemId, addQty, op.ts, scope, rev);
		}

		// default placement (scope '') — inherited by every place until dragged
		if (!getPlacement(db, itemId, GLOBAL)) {
			const prev = nextRev(db);
			db.prepare(
				`INSERT INTO placements (item_id, scope_place_id, position, hidden, rev) VALUES (?, ?, ?, 0, ?)`
			).run(itemId, GLOBAL, op.position, prev);
		}
		// added while a place was selected — give it a spot in that place's list too
		if (scope !== GLOBAL && !getPlacement(db, itemId, scope)) {
			const prev = nextRev(db);
			db.prepare(
				`INSERT INTO placements (item_id, scope_place_id, position, hidden, rev) VALUES (?, ?, ?, 0, ?)`
			).run(itemId, scope, op.position, prev);
		}
	},
	rename_item(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE items SET name = ?, name_norm = ?, rev = ? WHERE id = ?`).run(
			op.name.trim(),
			normalizeName(op.name),
			rev,
			op.item_id
		);
	},
	set_note(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE items SET note = ?, rev = ? WHERE id = ?`).run(op.note, rev, op.item_id);
	},
	set_check(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE list_state SET checked = ?, checked_at = ?, rev = ? WHERE item_id = ?`).run(
			op.checked ? 1 : 0,
			op.checked ? op.ts : 0,
			rev,
			op.item_id
		);
	},
	set_qty(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE list_state SET qty = ?, rev = ? WHERE item_id = ?`).run(
			Math.max(1, Math.round(op.qty)),
			rev,
			op.item_id
		);
	},
	set_item_scope(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE list_state SET scope_place_id = ?, rev = ? WHERE item_id = ?`).run(
			op.scope_place_id,
			rev,
			op.item_id
		);
	},
	set_staple(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE items SET is_staple = ?, rev = ? WHERE id = ?`).run(
			op.is_staple ? 1 : 0,
			rev,
			op.item_id
		);
	},
	remove_from_list(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE list_state SET on_list = 0, checked = 0, checked_at = 0, rev = ? WHERE item_id = ?`).run(
			rev,
			op.item_id
		);
	},
	delete_item(db, op) {
		const rev = nextRev(db);
		db.prepare(`UPDATE items SET deleted_at = ?, rev = ? WHERE id = ?`).run(op.ts, rev, op.item_id);
		const rev2 = nextRev(db);
		db.prepare(`UPDATE list_state SET on_list = 0, checked = 0, checked_at = 0, rev = ? WHERE item_id = ?`).run(
			rev2,
			op.item_id
		);
	},
	clear_checked(db) {
		const rev = nextRev(db);
		db.prepare(
			`UPDATE list_state SET on_list = 0, checked = 0, checked_at = 0, rev = ? WHERE checked = 1 AND on_list = 1`
		).run(rev);
	},

	move_item(db, op) {
		const rev = nextRev(db);
		const existing = getPlacement(db, op.item_id, op.scope_place_id);
		if (existing) {
			db.prepare(
				`UPDATE placements SET position = ?, rev = ? WHERE item_id = ? AND scope_place_id = ?`
			).run(op.position, rev, op.item_id, op.scope_place_id);
		} else {
			db.prepare(
				`INSERT INTO placements (item_id, scope_place_id, position, hidden, rev) VALUES (?, ?, ?, 0, ?)`
			).run(op.item_id, op.scope_place_id, op.position, rev);
		}
	},
	hide_item(db, op) {
		const rev = nextRev(db);
		const existing = getPlacement(db, op.item_id, op.scope_place_id);
		if (existing) {
			db.prepare(
				`UPDATE placements SET hidden = ?, rev = ? WHERE item_id = ? AND scope_place_id = ?`
			).run(op.hidden ? 1 : 0, rev, op.item_id, op.scope_place_id);
		} else {
			const base = resolvePlacement(db, op.item_id, op.scope_place_id);
			db.prepare(
				`INSERT INTO placements (item_id, scope_place_id, position, hidden, rev) VALUES (?, ?, ?, ?, ?)`
			).run(op.item_id, op.scope_place_id, base.position ?? 'a0', op.hidden ? 1 : 0, rev);
		}
	}
};

// ---------------------------------------------------------------------------
// Resolve (read models — pure functions of DB state)
// ---------------------------------------------------------------------------

export interface ResolvedPlacement {
	item_id: string;
	scope_place_id: PlaceScope;
	position: string | null;
	hidden: 0 | 1;
}

/** Effective placement of an item in a place view. `scope === GLOBAL` for the no-place view. */
export function resolvePlacement(db: DB, itemId: string, scope: PlaceScope): ResolvedPlacement {
	const def = getPlacement(db, itemId, GLOBAL);
	if (scope === GLOBAL) {
		return {
			item_id: itemId,
			scope_place_id: GLOBAL,
			position: def?.position ?? null,
			hidden: def?.hidden ?? 0
		};
	}
	const ov = getPlacement(db, itemId, scope);
	return {
		item_id: itemId,
		scope_place_id: scope,
		position: ov?.position ?? def?.position ?? null,
		hidden: ov ? ov.hidden : 0
	};
}

// ---------------------------------------------------------------------------
// changesSince — incremental sync payload
// ---------------------------------------------------------------------------

export function changesSince(db: DB, since: number): ChangeSet {
	const out = { cursor: currentRev(db) } as ChangeSet;
	for (const table of CHANGE_TABLES) {
		out[table] = db
			.prepare(`SELECT * FROM ${table} WHERE rev > ? ORDER BY rev`)
			.all(since) as never;
	}
	return out;
}
