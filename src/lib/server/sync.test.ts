import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import { openDb, type DB, currentRev } from './db';
import { applyOps, changesSince, resolvePlacement } from './sync';
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
		apply(op({ type: 'move_item', item_id: 'i1', scope_place_id: GLOBAL, position: KC }));
		apply(op({ type: 'remove_from_list', item_id: 'i1' }));
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'i1', name: 'Milk', position: KMID }));
		expect(resolvePlacement(db, 'i1', GLOBAL).position).toBe(KC);
		const ls = changesSince(db, 0).list_state.find((r) => r.item_id === 'i1')!;
		expect(ls.on_list).toBe(1);
		expect(ls.checked).toBe(0);
	});

	it('re-adding from "All" keeps the item\'s home store and per-store spot', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'ps', name: 'Pumpkin seeds', position: KA }));
		apply(op({ type: 'set_item_scope', item_id: 'ps', scope_place_id: 'lg' }));
		apply(op({ type: 'move_item', item_id: 'ps', scope_place_id: 'lg', position: KC }));
		apply(op({ type: 'set_check', item_id: 'ps', checked: true }));
		apply(op({ type: 'clear_checked' }));
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'ps2', name: 'pumpkin seeds', position: KMID }));
		const ls = changesSince(db, 0).list_state.find((r) => r.item_id === 'ps')!;
		expect(ls.on_list).toBe(1);
		expect(ls.scope_place_id).toBe('lg'); // home store remembered
		expect(resolvePlacement(db, 'ps', 'lg').position).toBe(KC); // spot remembered
	});

	it('re-adding from inside a store (re)homes the item there', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'ps', name: 'Pumpkin seeds', position: KA }));
		apply(op({ type: 'set_item_scope', item_id: 'ps', scope_place_id: 'lg' }));
		apply(op({ type: 'remove_from_list', item_id: 'ps' }));
		apply(op({ type: 'add_item', scope_place_id: 'costco', item_id: 'ps', name: 'Pumpkin seeds', position: KB }));
		const ls = changesSince(db, 0).list_state.find((r) => r.item_id === 'ps')!;
		expect(ls.scope_place_id).toBe('costco');
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

	it('adding while a place is selected gives the item a placement in that place', () => {
		apply(op({ type: 'add_place', place_id: 'costco', name: 'Costco', position: KA }));
		apply(op({ type: 'add_item', scope_place_id: 'costco', item_id: 'i1', name: 'Nails', position: KB }));
		const pls = changesSince(db, 0).placements.filter((p) => p.item_id === 'i1');
		expect(pls.map((p) => p.scope_place_id).sort()).toEqual(['', 'costco']);
	});

	const qtyOf = (id: string) => changesSince(db, 0).list_state.find((r) => r.item_id === id)!.qty;

	it('adding "milk" then "4 milks" bumps quantity on one item, not a new row', () => {
		apply(op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'm', name: 'milk', position: KA }));
		expect(qtyOf('m')).toBe(1);
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
		apply(op({ type: 'move_item', item_id: 'soy', scope_place_id: GLOBAL, position: KB }));
		expect(resolvePlacement(db, 'soy', 'costco').position).toBe(KB);
	});

	it('a per-place move creates an override that wins for that place only', () => {
		apply(op({ type: 'move_item', item_id: 'soy', scope_place_id: GLOBAL, position: KB }));
		apply(op({ type: 'move_item', item_id: 'soy', scope_place_id: 'costco', position: KC }));
		expect(resolvePlacement(db, 'soy', 'costco').position).toBe(KC);
		expect(resolvePlacement(db, 'soy', GLOBAL).position).toBe(KB);
	});

	it('hide_item hides for one place only, inheriting position so it does not jump', () => {
		apply(op({ type: 'move_item', item_id: 'soy', scope_place_id: GLOBAL, position: KB }));
		apply(op({ type: 'hide_item', item_id: 'soy', scope_place_id: 'costco', hidden: true }));
		expect(resolvePlacement(db, 'soy', 'costco')).toMatchObject({ hidden: 1, position: KB });
		expect(resolvePlacement(db, 'soy', GLOBAL).hidden).toBe(0);
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
		expect(changesSince(db, 0).items.find((i) => i.id === 'a')!.note).toBe('second');
	});
});

describe('delete_place', () => {
	it('soft-deletes the place', () => {
		apply(
			op({ type: 'add_place', place_id: 'costco', name: 'Costco', position: KA }),
			op({ type: 'add_item', scope_place_id: GLOBAL, item_id: 'soy', name: 'Soy', position: KA }),
			op({ type: 'move_item', item_id: 'soy', scope_place_id: 'costco', position: KB })
		);
		apply(op({ type: 'delete_place', place_id: 'costco' }));
		expect(changesSince(db, 0).places.find((p) => p.id === 'costco')!.deleted_at).toBeTruthy();
	});
});

describe('flatten migration', () => {
	it('a fresh :memory: db has no sections tables and flat placements', () => {
		expect(db.prepare(`SELECT 1 FROM pragma_table_info('placements') WHERE name='section_id'`).get()).toBeUndefined();
		expect(db.prepare(`SELECT name FROM sqlite_master WHERE name IN ('sections','section_order')`).all()).toEqual([]);
	});

	it('on legacy data: ranks by (section order, position), unsectioned last, drops the tables', async () => {
		const { tmpdir } = await import('os');
		const { join } = await import('path');
		const { unlinkSync } = await import('fs');
		const Sqlite = (await import('better-sqlite3')).default;

		const path = join(tmpdir(), `flat-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
		const raw = new Sqlite(path);
		raw.exec(`
			CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
			INSERT INTO meta VALUES ('rev','100'),('password_hash','x');
			CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
			CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT, name_norm TEXT, note TEXT DEFAULT '', is_staple INTEGER DEFAULT 0, rev INTEGER, deleted_at INTEGER);
			CREATE TABLE sections (id TEXT PRIMARY KEY, name TEXT, place_id TEXT DEFAULT '', rev INTEGER, deleted_at INTEGER);
			CREATE TABLE section_order (scope_place_id TEXT DEFAULT '', section_id TEXT, position TEXT, hidden INTEGER DEFAULT 0, rev INTEGER, PRIMARY KEY (scope_place_id, section_id));
			CREATE TABLE placements (item_id TEXT, scope_place_id TEXT DEFAULT '', section_id TEXT DEFAULT '', position TEXT, hidden INTEGER DEFAULT 0, rev INTEGER, PRIMARY KEY (item_id, scope_place_id));
			CREATE TABLE recipes (id TEXT PRIMARY KEY);
			CREATE TABLE item_aliases (alias_norm TEXT PRIMARY KEY, item_id TEXT, created_at INTEGER);
			INSERT INTO sections VALUES ('produce','Produce','',1,NULL),('dairy','Dairy','',1,NULL);
			INSERT INTO section_order VALUES ('','produce','a0',0,1),('','dairy','a1',0,1);
			INSERT INTO placements VALUES
				('milk','','dairy','a5',0,1), ('kale','','produce','a5',0,1), ('soap','','','a0',0,1);
		`);
		for (const n of ['0001_init', '0002_item_scope', '0003_checked_at', '0004_qty', '0005_recipes', '0006_recipe_ingredients', '0007_recipe_parse'])
			raw.prepare(`INSERT INTO schema_migrations (name, applied_at) VALUES (?, 0)`).run(n);
		raw.close();

		const migrated = openDb(path);
		expect(migrated.prepare(`SELECT name FROM sqlite_master WHERE name IN ('sections','section_order')`).all()).toEqual([]);
		expect(
			migrated.prepare(`SELECT item_id FROM placements WHERE scope_place_id='' ORDER BY position`).all().map((r) => (r as { item_id: string }).item_id)
		).toEqual(['kale', 'milk', 'soap']);
		migrated.close();
		try { unlinkSync(path); } catch { /* wal */ }
	});
});
