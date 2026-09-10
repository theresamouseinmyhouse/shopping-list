import { describe, it, expect } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import { emptyRows, applyOpToRows } from './rows';
import { buildView, type ListView } from './view';
import { GLOBAL, type Op, type OpInput } from '$lib/types';

let n = 0;
const mk = (o: OpInput): Op => ({ id: `v${++n}`, ts: 100 + n, ...o }) as Op;
const A = generateKeyBetween(null, null);
const B = generateKeyBetween(A, null);
const C = generateKeyBetween(B, null);

function view(ops: Op[], place = GLOBAL) {
	const r = emptyRows();
	for (const op of ops) applyOpToRows(r, op);
	return buildView(r, place);
}

/** ids in the "Not sorted yet" (place === null) group of an All view */
const loose = (v: ListView) => v.groups.find((g) => g.place === null)!.items.map((i) => i.id);
/** ids in a named store's group of an All view */
const grp = (v: ListView, placeId: string) =>
	v.groups.find((g) => g.place?.id === placeId)!.items.map((i) => i.id);

describe('buildView', () => {
	it('All view: unsorted items land in add order and reorder by move_item', () => {
		const v = view([
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'Apples', position: A }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'b', name: 'Bread', position: B }),
			mk({ type: 'move_item', item_id: 'a', scope_place_id: GLOBAL, position: C })
		]);
		expect(v.items).toEqual([]);
		expect(loose(v)).toEqual(['b', 'a']);
	});

	it('checked items go to the checked bucket; hidden (per place) to the hidden bucket', () => {
		const ops = [
			mk({ type: 'add_place', place_id: 'costco', name: 'Costco', position: A }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'A', position: A }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'b', name: 'B', position: B }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'c', name: 'C', position: C }),
			mk({ type: 'set_check', item_id: 'a', checked: true }),
			mk({ type: 'hide_item', item_id: 'b', scope_place_id: 'costco', hidden: true })
		];
		const v = view(ops, 'costco');
		expect(v.checked.map((i) => i.id)).toEqual(['a']);
		expect(v.hidden.map((i) => i.id)).toEqual(['b']);
		expect(v.items.map((i) => i.id)).toEqual(['c']);
		// in the All view, b is NOT hidden
		expect(view(ops, GLOBAL).hidden).toEqual([]);
	});

	it('All view groups items by their home store, in place order, then "Not sorted yet"', () => {
		const ops = [
			mk({ type: 'add_place', place_id: 'costco', name: 'Costco', position: A }),
			mk({ type: 'add_place', place_id: 'ht', name: 'Harris Teeter', position: B }),
			mk({ type: 'add_item', scope_place_id: 'costco', item_id: 'tp', name: 'Paper towels', position: A }),
			mk({ type: 'add_item', scope_place_id: 'ht', item_id: 'milk', name: 'Milk', position: A }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'gum', name: 'Gum', position: A })
		];
		const v = view(ops, GLOBAL);
		expect(v.groups.map((g) => g.place?.id ?? null)).toEqual(['costco', 'ht', null]);
		expect(grp(v, 'costco')).toEqual(['tp']);
		expect(grp(v, 'ht')).toEqual(['milk']);
		expect(loose(v)).toEqual(['gum']);
	});

	it('All view orders a store group by that store\'s own list, not the global one', () => {
		const ops = [
			mk({ type: 'add_place', place_id: 'costco', name: 'Costco', position: A }),
			mk({ type: 'add_item', scope_place_id: 'costco', item_id: 'x', name: 'X', position: A }),
			mk({ type: 'add_item', scope_place_id: 'costco', item_id: 'y', name: 'Y', position: B }),
			mk({ type: 'move_item', item_id: 'y', scope_place_id: 'costco', position: Z() })
		];
		expect(grp(view(ops, GLOBAL), 'costco')).toEqual(['y', 'x']);
	});
	function Z() {
		return generateKeyBetween(null, A);
	}

	it('set_item_scope moves an item between groups in the All view', () => {
		const base = [
			mk({ type: 'add_place', place_id: 'costco', name: 'Costco', position: A }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'tp', name: 'Paper towels', position: A })
		];
		expect(loose(view(base, GLOBAL))).toEqual(['tp']);
		expect(grp(view(base, GLOBAL), 'costco')).toEqual([]);

		const pinned = [...base, mk({ type: 'set_item_scope', item_id: 'tp', scope_place_id: 'costco' })];
		expect(grp(view(pinned, GLOBAL), 'costco')).toEqual(['tp']);
		expect(loose(view(pinned, GLOBAL))).toEqual([]);
		// and it now only shows on Costco's own list
		expect(view(pinned, 'costco').items.map((i) => i.id)).toEqual(['tp']);
	});

	it('an item added while a place is selected shows only in that place (+ the All view)', () => {
		const ops = [
			mk({ type: 'add_place', place_id: 'hardware', name: 'Hardware', position: A }),
			mk({ type: 'add_place', place_id: 'costco', name: 'Costco', position: B }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'milk', name: 'Milk', position: A }),
			mk({ type: 'add_item', scope_place_id: 'hardware', item_id: 'nails', name: 'Nails', position: B })
		];
		expect(view(ops, 'hardware').items.map((i) => i.id).sort()).toEqual(['milk', 'nails']);
		expect(view(ops, 'costco').items.map((i) => i.id)).toEqual(['milk']);
		expect(grp(view(ops, GLOBAL), 'hardware')).toEqual(['nails']);
		expect(loose(view(ops, GLOBAL))).toEqual(['milk']);
	});
});
