import Dexie, { type Table } from 'dexie';
import type {
	PlaceRow,
	SectionRow,
	SectionOrderRow,
	ItemRow,
	ListStateRow,
	PlacementRow,
	Op
} from '$lib/types';

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
	sections!: Table<SectionRow, string>;
	section_order!: Table<SectionOrderRow, [string, string]>;
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
	}
}

export const idb = new ListDB();
