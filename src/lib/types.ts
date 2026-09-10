// Shared types for the "list" app — used by both server (src/lib/server) and client (src/lib/client).

/**
 * The sentinel used everywhere a place is "not selected" / global / default.
 * SQLite composite primary keys do not dedupe NULLs, so we use '' instead of NULL
 * for the global scope in `placements.scope_place_id`.
 */
export const GLOBAL = '';

export type PlaceScope = string; // '' = global/default, otherwise a place id

// ---------------------------------------------------------------------------
// Row shapes (mirror the SQLite schema; also the wire shape returned by /api/sync)
// ---------------------------------------------------------------------------

export interface PlaceRow {
	id: string;
	name: string;
	position: string; // fractional index
	rev: number;
	deleted_at: number | null;
}

export interface ItemRow {
	id: string;
	name: string;
	name_norm: string;
	note: string;
	is_staple: 0 | 1;
	rev: number;
	deleted_at: number | null;
}

export interface ListStateRow {
	item_id: string;
	on_list: 0 | 1;
	checked: 0 | 1;
	added_at: number;
	checked_at: number; // epoch ms of the last check, 0 when unchecked
	qty: number; // >= 1
	/** '' = on every place's list; otherwise the item belongs only to that place */
	scope_place_id: PlaceScope;
	rev: number;
}

export interface PlacementRow {
	item_id: string;
	scope_place_id: PlaceScope; // '' = default placement (inherited by every place)
	position: string; // fractional index — the item's spot in this place's flat list
	hidden: 0 | 1; // 1 = on the master list but not carried at this store
	rev: number;
}

export interface ChangeSet {
	cursor: number;
	places: PlaceRow[];
	items: ItemRow[];
	list_state: ListStateRow[];
	placements: PlacementRow[];
}

export const CHANGE_TABLES = ['places', 'items', 'list_state', 'placements'] as const;
export type ChangeTable = (typeof CHANGE_TABLES)[number];

// ---------------------------------------------------------------------------
// Ops — semantic mutations produced by the client, applied by the server.
// Every op carries an envelope: { id, ts, type, ... }. `id` makes apply idempotent.
// ---------------------------------------------------------------------------

interface OpBase {
	id: string; // client-generated uuid
	ts: number; // client wall-clock, epoch ms
}

export type Op = OpBase &
	(
		| { type: 'add_place'; place_id: string; name: string; position: string }
		| { type: 'rename_place'; place_id: string; name: string }
		| { type: 'delete_place'; place_id: string }
		| { type: 'move_place'; place_id: string; position: string }
		| {
				type: 'add_item';
				item_id: string;
				name: string;
				note?: string;
				position: string;
				/** the place the item is being added to; '' = the "All" list */
				scope_place_id: PlaceScope;
				/** quantity to add; if the item is already on the list this is added to it (default 1) */
				qty?: number;
		  }
		| { type: 'rename_item'; item_id: string; name: string }
		| { type: 'set_note'; item_id: string; note: string }
		| { type: 'set_check'; item_id: string; checked: boolean }
		| { type: 'set_qty'; item_id: string; qty: number }
		| { type: 'set_item_scope'; item_id: string; scope_place_id: PlaceScope }
		| { type: 'set_staple'; item_id: string; is_staple: boolean }
		| { type: 'remove_from_list'; item_id: string } // the trashcan: off the active list, catalog + placements kept
		| { type: 'delete_item'; item_id: string } // hard delete from the catalog (v1.1 UI)
		| { type: 'clear_checked' } // bulk: every checked item off the list
		| { type: 'move_item'; item_id: string; scope_place_id: PlaceScope; position: string }
		| { type: 'hide_item'; item_id: string; scope_place_id: PlaceScope; hidden: boolean }
	);

export type OpType = Op['type'];

/** Omit that distributes over the Op union (plain Omit<Op,K> collapses to common keys). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An op without its envelope — what callers pass to `mutate()`. */
export type OpInput = DistributiveOmit<Op, 'id' | 'ts'>;

export interface SyncRequest {
	since: number;
	ops: Op[];
}

export type SyncResponse = ChangeSet;

/** lower-case, trim, collapse internal whitespace — for catalog dedupe + upsert. */
export function normalizeName(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
