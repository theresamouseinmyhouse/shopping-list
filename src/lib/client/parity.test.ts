// Guards the client<->server duplication: the same op stream must produce the same
// resolved placement on both engines.
import { describe, it, expect } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import { openDb } from '$lib/server/db';
import * as srv from '$lib/server/sync';
import { emptyRows, applyOpToRows, resolvePlacement, type Rows } from './rows';
import { GLOBAL, type Op, type OpInput } from '$lib/types';

let n = 0;
const mk = (o: OpInput): Op => ({ id: `p${++n}`, ts: 1000 + n, ...o }) as Op;
const A = generateKeyBetween(null, null);
const B = generateKeyBetween(A, null);
const C = generateKeyBetween(B, null);
const Z = generateKeyBetween(null, A);

const stream: Op[] = [
	mk({ type: 'add_place', place_id: 'costco', name: 'Costco', position: A }),
	mk({ type: 'add_place', place_id: 'ht', name: 'Harris Teeter', position: B }),
	mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'milk', name: 'Milk', position: A }),
	mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'soy', name: 'Soy Milk', position: B }),
	mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'kale', name: 'Kale', position: C }),
	mk({ type: 'move_item', item_id: 'milk', scope_place_id: GLOBAL, position: C }),
	mk({ type: 'move_item', item_id: 'soy', scope_place_id: 'costco', position: Z }),
	mk({ type: 'hide_item', item_id: 'soy', scope_place_id: 'costco', hidden: true }),
	mk({ type: 'set_check', item_id: 'kale', checked: true }),
	mk({ type: 'clear_checked' }),
	mk({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'kale', name: 'kale', position: A }) // re-add -> remembered spot
];

function clientRows(): Rows {
	const r = emptyRows();
	for (const op of stream) applyOpToRows(r, op);
	return r;
}
function serverDb() {
	const db = openDb(':memory:');
	srv.applyOps(db, stream);
	return db;
}

describe('client/server parity', () => {
	const scopes = [GLOBAL, 'costco', 'ht'];
	const items = ['milk', 'soy', 'kale'];

	it('resolvePlacement agrees for every item x scope', () => {
		const r = clientRows();
		const db = serverDb();
		for (const s of scopes)
			for (const it of items) {
				const c = resolvePlacement(r, it, s);
				const v = srv.resolvePlacement(db, it, s);
				expect({ s, it, position: c.position, hidden: c.hidden }).toEqual({
					s,
					it,
					position: v.position,
					hidden: v.hidden
				});
			}
	});

	it('list membership agrees', () => {
		const r = clientRows();
		const db = serverDb();
		const cOn = [...r.listState.values()].filter((l) => l.on_list).map((l) => l.item_id).sort();
		const vOn = srv
			.changesSince(db, 0)
			.list_state.filter((l) => l.on_list)
			.map((l) => l.item_id)
			.sort();
		expect(cOn).toEqual(vOn);
	});
});
