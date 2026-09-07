import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import { openDb, type DB, currentRev } from './db';
import { applyOps, changesSince, resolvePlacement, resolveSectionOrder } from './sync';
import { GLOBAL, type Op, type OpInput } from '../types';

let seq = 0;
function op(o: OpInput): Op {
	return { id: `op-${++seq}`, ts: Date.now() + seq, ...o } as Op;
}
const KA = generateKeyBetween(null, null); // 'a0'
const KB = generateKeyBetween(KA, null);
const KC = generateKeyBetween(KB, null);
const KMID = generateKeyBetween(KA, KB);

let db: DB;
beforeEach(() => {
	db = openDb(':memory:');
});

function apply(...ops: Op[]) {
	applyOps(db, ops);
}

describe('add_item', () => {
	it('adds a catalog item, puts it on the list, creates a default placement', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'i1', name: 'Milk', position: KA }));
		const cs = changesSince(db, 0);
		expect(cs.items.map((i) => i.name)).toEqual(['Milk']);
		expect(cs.items[0].name_norm).toBe('milk');
		expect(cs.list_state[0]).toMatchObject({ item_id: 'i1', on_list: 1, checked: 0 });
		expect(cs.placements).toHaveLength(1);
		expect(cs.placements[0]).toMatchObject({ item_id: 'i1', scope_place_id: GLOBAL, position: KA });
	});

	it('is idempotent by op id', () => {
		const o = op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'i1', name: 'Milk', position: KA });
		apply(o);
		apply(o);
		expect(changesSince(db, 0).items).toHaveLength(1);
	});

	it('re-adding a removed item keeps its remembered placement (does not move to end)', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'i1', name: 'Milk', position: KA }));
		apply(op({ type: 'move_item', item_id: 'i1', scope_place_id: GLOBAL, section_id: 's1', position: KC }));
		apply(op({ type: 'remove_from_list', item_id: 'i1' }));
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'i1', name: 'Milk', position: KMID }));
		const p = resolvePlacement(db, 'i1', GLOBAL);
		expect(p).toMatchObject({ section_id: 's1', position: KC });
		const ls = changesSince(db, 0).list_state.find((r) => r.item_id === 'i1')!;
		expect(ls.on_list).toBe(1);
		expect(ls.checked).toBe(0);
	});

	it('a second add of the same normalized name reuses the existing catalog item', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'i1', name: 'Onions', position: KA }));
		apply(op({ type: 'remove_from_list', item_id: 'i1' }));
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'i2', name: '  onions ', position: KB }));
		const items = changesSince(db, 0).items.filter((i) => !i.deleted_at);
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe('i1');
		expect(changesSince(db, 0).list_state.find((r) => r.item_id === 'i1')!.on_list).toBe(1);
	});

	const qtyOf = (id: string) =>
		changesSince(db, 0).list_state.find((r) => r.item_id === id)!.qty;

	it('adding "milk" then "4 milks" bumps quantity on one item, not a new row', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'm', name: 'milk', position: KA }));
		expect(qtyOf('m')).toBe(1);
		// "4 milks" -> client sends name 'milk', qty 4; server matches the plural too anyway
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'm2', name: 'milks', position: KB, qty: 4 }));
		expect(changesSince(db, 0).items.filter((i) => !i.deleted_at)).toHaveLength(1);
		expect(qtyOf('m')).toBe(5);
	});

	it('re-adding after removal sets quantity (does not accumulate)', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'Apples', position: KA, qty: 3 }));
		apply(op({ type: 'remove_from_list', item_id: 'a' }));
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'Apples', position: KA, qty: 2 }));
		expect(qtyOf('a')).toBe(2);
	});

	it('set_qty clamps to >= 1', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'x', name: 'X', position: KA }));
		apply(op({ type: 'set_qty', item_id: 'x', qty: 6 }));
		expect(qtyOf('x')).toBe(6);
		apply(op({ type: 'set_qty', item_id: 'x', qty: 0 }));
		expect(qtyOf('x')).toBe(1);
	});
});

describe('check-off and clearing', () => {
	beforeEach(() => {
		apply(
			op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'Apples', position: KA }),
			op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'b', name: 'Bread', position: KB })
		);
	});

	it('set_check toggles checked', () => {
		apply(op({ type: 'set_check', item_id: 'a', checked: true }));
		expect(changesSince(db, 0).list_state.find((r) => r.item_id === 'a')!.checked).toBe(1);
	});

	it('clear_checked removes only checked items from the list but keeps placements', () => {
		apply(op({ type: 'set_check', item_id: 'a', checked: true }));
		apply(op({ type: 'clear_checked' }));
		const ls = changesSince(db, 0).list_state;
		expect(ls.find((r) => r.item_id === 'a')).toMatchObject({ on_list: 0, checked: 0 });
		expect(ls.find((r) => r.item_id === 'b')).toMatchObject({ on_list: 1 });
		expect(resolvePlacement(db, 'a', GLOBAL).position).toBe(KA); // remembered
	});
});

describe('placement resolution & per-place overrides', () => {
	beforeEach(() => {
		apply(
			op({ type: 'add_place', place_id: 'costco', name: 'Costco', position: KA }),
			op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'soy', name: 'Soy milk', position: KA })
		);
	});

	it('a place with no override inherits the global placement', () => {
		apply(op({ type: 'move_item', item_id: 'soy', scope_place_id: GLOBAL, section_id: 'dairy', position: KB }));
		expect(resolvePlacement(db, 'soy', 'costco')).toMatchObject({ section_id: 'dairy', position: KB });
	});

	it('a per-place move creates an override that wins for that place only', () => {
		apply(op({ type: 'move_item', item_id: 'soy', scope_place_id: GLOBAL, section_id: 'dairy', position: KB }));
		apply(op({ type: 'move_item', item_id: 'soy', scope_place_id: 'costco', section_id: 'cooler', position: KC }));
		expect(resolvePlacement(db, 'soy', 'costco')).toMatchObject({ section_id: 'cooler', position: KC });
		expect(resolvePlacement(db, 'soy', GLOBAL)).toMatchObject({ section_id: 'dairy', position: KB });
	});

	it('hide_item hides for one place only, inheriting section/position so it does not jump', () => {
		apply(op({ type: 'move_item', item_id: 'soy', scope_place_id: GLOBAL, section_id: 'dairy', position: KB }));
		apply(op({ type: 'hide_item', item_id: 'soy', scope_place_id: 'costco', hidden: true }));
		expect(resolvePlacement(db, 'soy', 'costco')).toMatchObject({
			hidden: 1,
			section_id: 'dairy',
			position: KB
		});
		expect(resolvePlacement(db, 'soy', GLOBAL).hidden).toBe(0);
	});
});

describe('sections & ordering', () => {
	it('global section order is inherited by places and overridable per place', () => {
		apply(
			op({ type: 'add_place', place_id: 'ht', name: 'Harris Teeter', position: KA }),
			op({ type: 'add_section', section_id: 'produce', name: 'Produce', place_id: GLOBAL, position: KA }),
			op({ type: 'add_section', section_id: 'dairy', name: 'Dairy', place_id: GLOBAL, position: KB })
		);
		// global / no-place view
		expect(resolveSectionOrder(db, GLOBAL).map((s) => s.section_id)).toEqual(['produce', 'dairy']);
		// place inherits
		expect(resolveSectionOrder(db, 'ht').map((s) => s.section_id)).toEqual(['produce', 'dairy']);
		// reorder for the place only
		apply(op({ type: 'move_section', scope_place_id: 'ht', section_id: 'dairy', position: generateKeyBetween(null, KA) }));
		expect(resolveSectionOrder(db, 'ht').map((s) => s.section_id)).toEqual(['dairy', 'produce']);
		expect(resolveSectionOrder(db, GLOBAL).map((s) => s.section_id)).toEqual(['produce', 'dairy']);
	});

	it('a place-specific section only shows for that place', () => {
		apply(
			op({ type: 'add_place', place_id: 'costco', name: 'Costco', position: KA }),
			op({ type: 'add_place', place_id: 'ht', name: 'HT', position: KB }),
			op({ type: 'add_section', section_id: 'bulk', name: 'Bulk', place_id: 'costco', position: KA })
		);
		expect(resolveSectionOrder(db, 'costco').map((s) => s.section_id)).toEqual(['bulk']);
		expect(resolveSectionOrder(db, 'ht')).toEqual([]);
		expect(resolveSectionOrder(db, GLOBAL)).toEqual([]);
	});

	it('hide_section hides it in a place view; delete_section removes it everywhere', () => {
		apply(
			op({ type: 'add_place', place_id: 'ht', name: 'HT', position: KA }),
			op({ type: 'add_section', section_id: 'pharmacy', name: 'Pharmacy', place_id: GLOBAL, position: KA })
		);
		apply(op({ type: 'hide_section', scope_place_id: 'ht', section_id: 'pharmacy', hidden: true }));
		expect(resolveSectionOrder(db, 'ht')).toEqual([]);
		expect(resolveSectionOrder(db, GLOBAL).map((s) => s.section_id)).toEqual(['pharmacy']);
		apply(op({ type: 'delete_section', section_id: 'pharmacy' }));
		expect(resolveSectionOrder(db, GLOBAL)).toEqual([]);
	});
});

describe('changesSince / cursor', () => {
	it('only returns rows changed after the cursor and advances it', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'A', position: KA }));
		const c1 = changesSince(db, 0).cursor;
		expect(c1).toBe(currentRev(db));
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'b', name: 'B', position: KB }));
		const cs = changesSince(db, c1);
		expect(cs.items.map((i) => i.id)).toEqual(['b']);
		expect(cs.cursor).toBeGreaterThan(c1);
	});

	it('later op wins (last-write-wins by rev)', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'A', position: KA }));
		apply(op({ type: 'set_note', item_id: 'a', note: 'first' }));
		apply(op({ type: 'set_note', item_id: 'a', note: 'second' }));
		const item = changesSince(db, 0).items.find((i) => i.id === 'a')!;
		expect(item.note).toBe('second');
	});
});

describe('delete_place', () => {
	it('soft-deletes the place and its per-place overrides stop applying', () => {
		apply(
			op({ type: 'add_place', place_id: 'costco', name: 'Costco', position: KA }),
			op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'soy', name: 'Soy', position: KA }),
			op({ type: 'move_item', item_id: 'soy', scope_place_id: 'costco', section_id: 'x', position: KB })
		);
		apply(op({ type: 'delete_place', place_id: 'costco' }));
		const places = changesSince(db, 0).places;
		expect(places.find((p) => p.id === 'costco')!.deleted_at).toBeTruthy();
	});
});
