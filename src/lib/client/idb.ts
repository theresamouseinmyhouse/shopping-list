import Dexie, { type Table } from 'dexie';
import type { PlaceRow, ItemRow, ListStateRow, PlacementRow, Op } from '$lib/types';

export interface OutboxRow {
	id: string; // op id
	op: Op;
	created: number;
}
export interface KV {
	key: string;
	value: string;
}

class ListDB extends Dexie {
	places!: Table<PlaceRow, string>;
	items!: Table<ItemRow, string>;
	list_state!: Table<ListStateRow, string>;
	placements!: Table<PlacementRow, [string, string]>;
	outbox!: Table<OutboxRow, string>;
	kv!: Table<KV, string>;

	constructor() {
		super('list');
		this.version(1).stores({
			places: 'id',
			sections: 'id, place_id',
			section_order: '[scope_place_id+section_id]',
			items: 'id, name_norm',
			list_state: 'item_id',
			placements: '[item_id+scope_place_id]',
			outbox: 'id, created',
			kv: 'key'
		});
		// v2: sections removed — one flat list per place. Drop the caches and force a
		// full re-pull of placements (their positions changed server-side).
		this.version(2)
			.stores({ sections: null, section_order: null })
			.upgrade(async (tx) => {
				await tx.table('placements').clear();
				await tx.table('kv').put({ key: 'cursor', value: '0' });
			});
	}
}

export const idb = new ListDB();
