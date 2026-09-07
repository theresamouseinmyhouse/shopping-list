import { GLOBAL, type PlaceRow, type PlaceScope } from '$lib/types';
import { resolvePlacement, resolveSections, type Rows, type ResolvedSection } from './rows';

export interface ItemView {
	id: string;
	name: string;
	note: string;
	checked: boolean;
	hidden: boolean;
	is_staple: boolean;
	qty: number;
	scope_place_id: string; // '' = on every store's list; else pinned to that store
	position: string | null;
	added_at: number;
}
export interface SectionView {
	section_id: string;
	name: string;
	items: ItemView[];
}
export interface ListView {
	places: PlaceRow[];
	sections: SectionView[];
	unsectioned: ItemView[];
	checked: ItemView[];
	hidden: ItemView[];
	hiddenSections: ResolvedSection[];
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

	const { visible: sections, hidden: hiddenSections } = resolveSections(rows, place);
	const buckets = new Map<string, ItemView[]>(sections.map((s) => [s.section_id, []]));
	const unsectioned: ItemView[] = [];
	const checked: ItemView[] = [];
	const hidden: ItemView[] = [];

	for (const ls of rows.listState.values()) {
		if (!ls.on_list) continue;
		// membership: '' = every place; otherwise only that place. The "All" view (place === '') shows everything.
		if (place !== GLOBAL && ls.scope_place_id !== GLOBAL && ls.scope_place_id !== place) continue;
		const item = rows.items.get(ls.item_id);
		if (!item || item.deleted_at) continue;
		const p = resolvePlacement(rows, ls.item_id, place);
		const iv: ItemView = {
			id: item.id,
			name: item.name,
			note: item.note,
			checked: !!ls.checked,
			hidden: !!p.hidden,
			is_staple: !!item.is_staple,
			qty: ls.qty || 1,
			scope_place_id: ls.scope_place_id || GLOBAL,
			position: p.position,
			added_at: ls.added_at
		};
		if (iv.checked) checked.push(iv);
		else if (iv.hidden) hidden.push(iv);
		else if (p.section_id !== GLOBAL && buckets.has(p.section_id)) buckets.get(p.section_id)!.push(iv);
		else unsectioned.push(iv);
	}

	for (const arr of buckets.values()) arr.sort(bySort);
	unsectioned.sort(bySort);
	checked.sort(bySort);
	hidden.sort(bySort);

	return {
		places,
		sections: sections.map((s) => ({
			section_id: s.section_id,
			name: s.name,
			items: buckets.get(s.section_id) ?? []
		})),
		unsectioned,
		checked,
		hidden,
		hiddenSections
	};
}
