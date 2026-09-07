// Client-side mirror of the server's row model + a compact optimistic `applyOp`
// and the same placement/section resolution. The server (src/lib/server/sync.ts)
// remains the source of truth; this just makes the UI feel instant and keeps
// working offline. Server changes overwrite these rows on the next sync.

import { nameVariants } from '$lib/quantity';
import {
	GLOBAL,
	normalizeName,
	type ItemRow,
	type ListStateRow,
	type Op,
	type PlaceRow,
	type PlaceScope,
	type PlacementRow,
	type SectionOrderRow,
	type SectionRow
} from '$lib/types';

export interface Rows {
	places: Map<string, PlaceRow>;
	sections: Map<string, SectionRow>;
	sectionOrder: Map<string, SectionOrderRow>; // key soKey(scope, sectionId)
	items: Map<string, ItemRow>;
	listState: Map<string, ListStateRow>;
	placements: Map<string, PlacementRow>; // key plKey(itemId, scope)
}

const SEP = ''; // unit separator — cannot occur in ids or the '' scope
export const soKey = (scope: PlaceScope, sectionId: string) => `${scope}${SEP}${sectionId}`;
export const plKey = (itemId: string, scope: PlaceScope) => `${itemId}${SEP}${scope}`;

export function emptyRows(): Rows {
	return {
		places: new Map(),
		sections: new Map(),
		sectionOrder: new Map(),
		items: new Map(),
		listState: new Map(),
		placements: new Map()
	};
}

export function cloneRows(r: Rows): Rows {
	return {
		places: new Map(r.places),
		sections: new Map(r.sections),
		sectionOrder: new Map(r.sectionOrder),
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
		case 'add_section':
			r.sections.set(op.section_id, {
				id: op.section_id,
				name: op.name.trim(),
				place_id: op.place_id,
				rev: 0,
				deleted_at: null
			});
			r.sectionOrder.set(soKey(op.place_id, op.section_id), {
				scope_place_id: op.place_id,
				section_id: op.section_id,
				position: op.position,
				hidden: 0,
				rev: 0
			});
			break;
		case 'rename_section': {
			const s = r.sections.get(op.section_id);
			if (s) s.name = op.name.trim();
			break;
		}
		case 'delete_section': {
			const s = r.sections.get(op.section_id);
			if (s) s.deleted_at = op.ts;
			break;
		}
		case 'move_section':
			upsertSO(r, op.scope_place_id, op.section_id, { position: op.position });
			break;
		case 'hide_section':
			upsertSO(r, op.scope_place_id, op.section_id, { hidden: op.hidden ? 1 : 0 });
			break;

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
				scope_place_id: op.scope_place_id,
				rev: 0
			});
			if (!r.placements.has(plKey(item.id, GLOBAL))) {
				r.placements.set(plKey(item.id, GLOBAL), {
					item_id: item.id,
					scope_place_id: GLOBAL,
					section_id: op.section_id ?? GLOBAL,
					position: op.position,
					hidden: 0,
					rev: 0
				});
			}
			if (op.section_id && op.scope_place_id !== GLOBAL) {
				r.placements.set(plKey(item.id, op.scope_place_id), {
					item_id: item.id,
					scope_place_id: op.scope_place_id,
					section_id: op.section_id,
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
				ex.section_id = op.section_id;
				ex.position = op.position;
			} else {
				r.placements.set(k, {
					item_id: op.item_id,
					scope_place_id: op.scope_place_id,
					section_id: op.section_id,
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
					section_id: base.section_id,
					position: base.position ?? 'a0',
					hidden: op.hidden ? 1 : 0,
					rev: 0
				});
			}
			break;
		}
	}
}

function upsertSO(
	r: Rows,
	scope: PlaceScope,
	sectionId: string,
	patch: { position?: string; hidden?: 0 | 1 }
): void {
	const k = soKey(scope, sectionId);
	const ex = r.sectionOrder.get(k);
	if (ex) {
		if (patch.position !== undefined) ex.position = patch.position;
		if (patch.hidden !== undefined) ex.hidden = patch.hidden;
	} else {
		const global = r.sectionOrder.get(soKey(GLOBAL, sectionId));
		r.sectionOrder.set(k, {
			scope_place_id: scope,
			section_id: sectionId,
			position: patch.position ?? global?.position ?? 'a0',
			hidden: patch.hidden ?? 0,
			rev: 0
		});
	}
}

// --- resolution (mirrors server) -----------------------------------------

export interface ResolvedPlacement {
	section_id: string;
	position: string | null;
	hidden: 0 | 1;
}

export function resolvePlacement(r: Rows, itemId: string, scope: PlaceScope): ResolvedPlacement {
	const def = r.placements.get(plKey(itemId, GLOBAL));
	if (scope === GLOBAL) {
		return {
			section_id: def?.section_id ?? GLOBAL,
			position: def?.position ?? null,
			hidden: def?.hidden ?? 0
		};
	}
	const ov = r.placements.get(plKey(itemId, scope));
	return {
		section_id: ov?.section_id ?? def?.section_id ?? GLOBAL,
		position: ov?.position ?? def?.position ?? null,
		hidden: ov ? ov.hidden : 0
	};
}

export interface ResolvedSection {
	section_id: string;
	name: string;
	position: string | null;
	hidden: boolean;
}

const bySection = (a: ResolvedSection, b: ResolvedSection) =>
	cmp(a.position, b.position) ||
	a.name.localeCompare(b.name) ||
	a.section_id.localeCompare(b.section_id);

/** All sections applicable to a place view, split into visible (ordered) and hidden. */
export function resolveSections(
	r: Rows,
	scope: PlaceScope
): { visible: ResolvedSection[]; hidden: ResolvedSection[] } {
	const all: ResolvedSection[] = [];
	for (const sec of r.sections.values()) {
		if (sec.deleted_at) continue;
		if (sec.place_id !== GLOBAL && sec.place_id !== scope) continue;
		const scoped = scope === GLOBAL ? undefined : r.sectionOrder.get(soKey(scope, sec.id));
		const global = r.sectionOrder.get(soKey(GLOBAL, sec.id));
		const eff = scoped ?? global;
		all.push({
			section_id: sec.id,
			name: sec.name,
			position: eff?.position ?? null,
			hidden: eff ? !!eff.hidden : false
		});
	}
	return {
		visible: all.filter((s) => !s.hidden).sort(bySection),
		hidden: all.filter((s) => s.hidden).sort(bySection)
	};
}

export function resolveSectionOrder(r: Rows, scope: PlaceScope): ResolvedSection[] {
	return resolveSections(r, scope).visible;
}

/** Effective hidden state of a section in a place view (place-row wins, else the default row). */
export function sectionHiddenIn(r: Rows, sectionId: string, scope: PlaceScope): boolean {
	const scoped = scope === GLOBAL ? undefined : r.sectionOrder.get(soKey(scope, sectionId));
	const eff = scoped ?? r.sectionOrder.get(soKey(GLOBAL, sectionId));
	return eff ? !!eff.hidden : false;
}

function cmp(a: string | null, b: string | null): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a < b ? -1 : 1;
}
