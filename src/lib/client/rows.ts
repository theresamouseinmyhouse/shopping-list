// Client-side mirror of the server's row model + a compact optimistic `applyOp`
// and the same placement resolution. The server (src/lib/server/sync.ts) remains
// the source of truth; this just makes the UI feel instant and keeps working
// offline. Server changes overwrite these rows on the next sync.

import { nameVariants } from '$lib/quantity';
import {
	GLOBAL,
	normalizeName,
	type ItemRow,
	type ListStateRow,
	type Op,
	type PlaceRow,
	type PlaceScope,
	type PlacementRow
} from '$lib/types';

export interface Rows {
	places: Map<string, PlaceRow>;
	items: Map<string, ItemRow>;
	listState: Map<string, ListStateRow>;
	placements: Map<string, PlacementRow>; // key plKey(itemId, scope)
}

const SEP = ''; // unit separator — cannot occur in ids or the '' scope
export const plKey = (itemId: string, scope: PlaceScope) => `${itemId}${SEP}${scope}`;

export function emptyRows(): Rows {
	return {
		places: new Map(),
		items: new Map(),
		listState: new Map(),
		placements: new Map()
	};
}

export function cloneRows(r: Rows): Rows {
	return {
		places: new Map(r.places),
		items: new Map(r.items),
		listState: new Map(r.listState),
		placements: new Map(r.placements)
	};
}

// --- optimistic apply ------------------------------------------------------

export function applyOpToRows(r: Rows, op: Op): void {
	switch (op.type) {
		case 'add_place':
			r.places.set(op.place_id, {
				id: op.place_id,
				name: op.name.trim(),
				position: op.position,
				rev: 0,
				deleted_at: null
			});
			break;
		case 'rename_place': {
			const p = r.places.get(op.place_id);
			if (p) p.name = op.name.trim();
			break;
		}
		case 'move_place': {
			const p = r.places.get(op.place_id);
			if (p) p.position = op.position;
			break;
		}
		case 'delete_place': {
			const p = r.places.get(op.place_id);
			if (p) p.deleted_at = op.ts;
			break;
		}

		case 'add_item': {
			const norm = normalizeName(op.name);
			const norms = new Set(nameVariants(op.name).map(normalizeName));
			let item =
				r.items.get(op.item_id) ??
				[...r.items.values()].find((i) => i.name_norm === norm && !i.deleted_at) ??
				[...r.items.values()].find((i) => norms.has(i.name_norm) && !i.deleted_at);
			if (!item) {
				item = {
					id: op.item_id,
					name: op.name.trim(),
					name_norm: norm,
					note: op.note ?? '',
					is_staple: 0,
					rev: 0,
					deleted_at: null
				};
				r.items.set(item.id, item);
			} else {
				item.deleted_at = null;
			}
			const addQty = Math.max(1, Math.round(op.qty ?? 1));
			const prev = r.listState.get(item.id);
			r.listState.set(item.id, {
				item_id: item.id,
				on_list: 1,
				checked: 0,
				checked_at: 0,
				qty: prev?.on_list ? prev.qty + addQty : addQty,
				added_at: op.ts,
				// re-adding from "All" keeps the remembered home store; adding from inside a store (re)homes it
				scope_place_id: op.scope_place_id || prev?.scope_place_id || GLOBAL,
				rev: 0
			});
			if (!r.placements.has(plKey(item.id, GLOBAL))) {
				r.placements.set(plKey(item.id, GLOBAL), {
					item_id: item.id,
					scope_place_id: GLOBAL,
					position: op.position,
					hidden: 0,
					rev: 0
				});
			}
			if (op.scope_place_id !== GLOBAL && !r.placements.has(plKey(item.id, op.scope_place_id))) {
				r.placements.set(plKey(item.id, op.scope_place_id), {
					item_id: item.id,
					scope_place_id: op.scope_place_id,
					position: op.position,
					hidden: 0,
					rev: 0
				});
			}
			break;
		}
		case 'rename_item': {
			const i = r.items.get(op.item_id);
			if (i) {
				i.name = op.name.trim();
				i.name_norm = normalizeName(op.name);
			}
			break;
		}
		case 'set_note': {
			const i = r.items.get(op.item_id);
			if (i) i.note = op.note;
			break;
		}
		case 'set_staple': {
			const i = r.items.get(op.item_id);
			if (i) i.is_staple = op.is_staple ? 1 : 0;
			break;
		}
		case 'set_check': {
			const ls = r.listState.get(op.item_id);
			if (ls) {
				ls.checked = op.checked ? 1 : 0;
				ls.checked_at = op.checked ? op.ts : 0;
			}
			break;
		}
		case 'set_qty': {
			const ls = r.listState.get(op.item_id);
			if (ls) ls.qty = Math.max(1, Math.round(op.qty));
			break;
		}
		case 'set_item_scope': {
			const ls = r.listState.get(op.item_id);
			if (ls) ls.scope_place_id = op.scope_place_id;
			break;
		}
		case 'remove_from_list': {
			const ls = r.listState.get(op.item_id);
			if (ls) {
				ls.on_list = 0;
				ls.checked = 0;
				ls.checked_at = 0;
			}
			break;
		}
		case 'delete_item': {
			const i = r.items.get(op.item_id);
			if (i) i.deleted_at = op.ts;
			const ls = r.listState.get(op.item_id);
			if (ls) {
				ls.on_list = 0;
				ls.checked = 0;
				ls.checked_at = 0;
			}
			break;
		}
		case 'clear_checked':
			for (const ls of r.listState.values()) {
				if (ls.checked && ls.on_list) {
					ls.on_list = 0;
					ls.checked = 0;
					ls.checked_at = 0;
				}
			}
			break;

		case 'move_item': {
			const k = plKey(op.item_id, op.scope_place_id);
			const ex = r.placements.get(k);
			if (ex) {
				ex.position = op.position;
			} else {
				r.placements.set(k, {
					item_id: op.item_id,
					scope_place_id: op.scope_place_id,
					position: op.position,
					hidden: 0,
					rev: 0
				});
			}
			break;
		}
		case 'hide_item': {
			const k = plKey(op.item_id, op.scope_place_id);
			const ex = r.placements.get(k);
			if (ex) {
				ex.hidden = op.hidden ? 1 : 0;
			} else {
				const base = resolvePlacement(r, op.item_id, op.scope_place_id);
				r.placements.set(k, {
					item_id: op.item_id,
					scope_place_id: op.scope_place_id,
					position: base.position ?? 'a0',
					hidden: op.hidden ? 1 : 0,
					rev: 0
				});
			}
			break;
		}
	}
}

// --- resolution (mirrors server) -----------------------------------------

export interface ResolvedPlacement {
	position: string | null;
	hidden: 0 | 1;
}

export function resolvePlacement(r: Rows, itemId: string, scope: PlaceScope): ResolvedPlacement {
	const def = r.placements.get(plKey(itemId, GLOBAL));
	if (scope === GLOBAL) {
		return { position: def?.position ?? null, hidden: def?.hidden ?? 0 };
	}
	const ov = r.placements.get(plKey(itemId, scope));
	return {
		position: ov?.position ?? def?.position ?? null,
		hidden: ov ? ov.hidden : 0
	};
}
