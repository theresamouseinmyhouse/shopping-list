import { GLOBAL, type PlaceRow, type PlaceScope } from '$lib/types';
import { resolvePlacement, type Rows } from './rows';

export interface ItemView {
	id: string;
	name: string;
	note: string;
	checked: boolean;
	hidden: boolean;
	is_staple: boolean;
	qty: number;
	scope_place_id: string; // '' = not sorted into a store yet; else the item's home store
	position: string | null;
	added_at: number;
}
export interface ListGroup {
	place: PlaceRow | null; // null = the "Not sorted yet" group
	items: ItemView[];
}
export interface ListView {
	places: PlaceRow[];
	items: ItemView[]; // the flat, drag-ordered list for a single-store view ([] in the All view)
	groups: ListGroup[]; // per-store groups — populated only in the All view
	checked: ItemView[];
	hidden: ItemView[]; // on the master list but hidden at this store
}

function bySort(a: ItemView, b: ItemView): number {
	if (a.position !== b.position) {
		if (a.position === null) return 1;
		if (b.position === null) return -1;
		return a.position < b.position ? -1 : 1;
	}
	return a.added_at - b.added_at || a.name.localeCompare(b.name);
}

export function buildView(rows: Rows, place: PlaceScope): ListView {
	const places = [...rows.places.values()]
		.filter((p) => !p.deleted_at)
		.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

	const flat: ItemView[] = []; // on the list, not checked, not hidden
	const checked: ItemView[] = [];
	const hidden: ItemView[] = [];

	for (const ls of rows.listState.values()) {
		if (!ls.on_list) continue;
		const home = ls.scope_place_id || GLOBAL;
		// membership: '' = every place; otherwise only that place. "All" (place === '') shows everything.
		if (place !== GLOBAL && home !== GLOBAL && home !== place) continue;
		const item = rows.items.get(ls.item_id);
		if (!item || item.deleted_at) continue;
		// All view: order each item by its spot in its home store's list.
		// Single-store view: order by this store's list.
		const orderAt = place === GLOBAL ? home : place;
		const position = resolvePlacement(rows, ls.item_id, orderAt).position;
		// hiding is a per-store flag and only meaningful inside a store view
		const isHidden = place === GLOBAL ? false : !!resolvePlacement(rows, ls.item_id, place).hidden;
		const iv: ItemView = {
			id: item.id,
			name: item.name,
			note: item.note,
			checked: !!ls.checked,
			hidden: isHidden,
			is_staple: !!item.is_staple,
			qty: ls.qty || 1,
			scope_place_id: home,
			position,
			added_at: ls.added_at
		};
		if (iv.checked) checked.push(iv);
		else if (iv.hidden) hidden.push(iv);
		else flat.push(iv);
	}

	flat.sort(bySort);
	checked.sort(bySort);
	hidden.sort(bySort);

	if (place !== GLOBAL) {
		return { places, items: flat, groups: [], checked, hidden };
	}

	const groups: ListGroup[] = places.map((p) => ({
		place: p,
		items: flat.filter((i) => i.scope_place_id === p.id)
	}));
	groups.push({ place: null, items: flat.filter((i) => i.scope_place_id === GLOBAL) });

	return { places, items: [], groups, checked, hidden };
}
