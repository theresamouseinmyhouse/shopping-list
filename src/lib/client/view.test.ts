import { describe, it, expect } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import { emptyRows, applyOpToRows } from './rows';
import { buildView } from './view';
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

describe('buildView', () => {
	it('new items land unsectioned in add order', () => {
		const v = view([
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'Apples', position: A }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'b', name: 'Bread', position: B })
		]);
		expect(v.unsectioned.map((i) => i.id)).toEqual(['a', 'b']);
		expect(v.sections).toEqual([]);
	});

	it('groups items into sections in resolved order; sections with no items still render', () => {
		const v = view([
			mk({ type: 'add_section', section_id: 's1', name: 'Produce', place_id: GLOBAL, position: A }),
			mk({ type: 'add_section', section_id: 's2', name: 'Dairy', place_id: GLOBAL, position: B }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'Apples', position: A }),
			mk({ type: 'move_item', item_id: 'a', scope_place_id: GLOBAL, section_id: 's1', position: A })
		]);
		expect(v.sections.map((s) => s.name)).toEqual(['Produce', 'Dairy']);
		expect(v.sections[0].items.map((i) => i.id)).toEqual(['a']);
		expect(v.sections[1].items).toEqual([]);
		expect(v.unsectioned).toEqual([]);
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
		expect(v.unsectioned.map((i) => i.id)).toEqual(['c']);
		// in the no-place view, b is NOT hidden
		expect(view(ops, GLOBAL).hidden).toEqual([]);
	});

	it('set_item_scope pins an existing item to one store (and can release it)', () => {
		const base = [
			mk({ type: 'add_place', place_id: 'costco', name: 'Costco', position: A }),
			mk({ type: 'add_place', place_id: 'ht', name: 'HT', position: B }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'tp', name: 'Paper towels', position: A })
		];
		expect(view(base, 'costco').unsectioned.map((i) => i.id)).toEqual(['tp']);
		expect(view(base, 'ht').unsectioned.map((i) => i.id)).toEqual(['tp']);

		const pinned = [...base, mk({ type: 'set_item_scope', item_id: 'tp', scope_place_id: 'costco' })];
		expect(view(pinned, 'costco').unsectioned.map((i) => i.id)).toEqual(['tp']);
		expect(view(pinned, 'ht').unsectioned).toEqual([]);
		expect(view(pinned, GLOBAL).unsectioned.map((i) => i.id)).toEqual(['tp']); // still shows in All

		const released = [...pinned, mk({ type: 'set_item_scope', item_id: 'tp', scope_place_id: GLOBAL })];
		expect(view(released, 'ht').unsectioned.map((i) => i.id)).toEqual(['tp']);
	});

	it('an item added while a place is selected shows only in that place (+ the All view)', () => {
		const ops = [
			mk({ type: 'add_place', place_id: 'hardware', name: 'Hardware', position: A }),
			mk({ type: 'add_place', place_id: 'costco', name: 'Costco', position: B }),
			mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'milk', name: 'Milk', position: A }),
			mk({ type: 'add_item', scope_place_id: 'hardware', item_id: 'nails', name: 'Nails', position: B })
		];
		expect(view(ops, 'hardware').unsectioned.map((i) => i.id).sort()).toEqual(['milk', 'nails']);
		expect(view(ops, 'costco').unsectioned.map((i) => i.id)).toEqual(['milk']);
		expect(view(ops, GLOBAL).unsectioned.map((i) => i.id).sort()).toEqual(['milk', 'nails']);
	});

	it('a section can be limited to specific stores by hiding it at the others', () => {
		const base = [
			mk({ type: 'add_place', place_id: 'grocery', name: 'Grocery', position: A }),
			mk({ type: 'add_place', place_id: 'hardware', name: 'Hardware', position: B }),
			mk({ type: 'add_section', section_id: 'produce', name: 'Produce', place_id: GLOBAL, position: A }),
			mk({ type: 'hide_section', scope_place_id: 'hardware', section_id: 'produce', hidden: true })
		];
		expect(view(base, 'grocery').sections.map((s) => s.name)).toEqual(['Produce']);
		expect(view(base, 'hardware').sections).toEqual([]);
		expect(view(base, 'hardware').hiddenSections.map((s) => s.name)).toEqual(['Produce']);
	});

	it('hidden sections are surfaced separately (not just dropped)', () => {
		const ops = [
			mk({ type: 'add_place', place_id: 'ht', name: 'HT', position: A }),
			mk({ type: 'add_section', section_id: 's1', name: 'Pharmacy', place_id: GLOBAL, position: A }),
			mk({ type: 'hide_section', scope_place_id: 'ht', section_id: 's1', hidden: true })
		];
		const v = view(ops, 'ht');
		expect(v.sections).toEqual([]);
		expect(v.hiddenSections.map((s) => s.name)).toEqual(['Pharmacy']);
		// un-hidden again
		const v2 = view(
			[...ops, mk({ type: 'hide_section', scope_place_id: 'ht', section_id: 's1', hidden: false })],
			'ht'
		);
		expect(v2.sections.map((s) => s.name)).toEqual(['Pharmacy']);
		expect(v2.hiddenSections).toEqual([]);
	});

	it('item in a section that is hidden for this place falls back to unsectioned', () => {
		const v = view(
			[
				mk({ type: 'add_place', place_id: 'ht', name: 'HT', position: A }),
				mk({ type: 'add_section', section_id: 's1', name: 'Pharmacy', place_id: GLOBAL, position: A }),
				mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'a', name: 'Aspirin', position: A }),
				mk({ type: 'move_item', item_id: 'a', scope_place_id: GLOBAL, section_id: 's1', position: A }),
				mk({ type: 'hide_section', scope_place_id: 'ht', section_id: 's1', hidden: true })
			],
			'ht'
		);
		expect(v.sections).toEqual([]);
		expect(v.unsectioned.map((i) => i.id)).toEqual(['a']);
	});
});
