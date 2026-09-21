import { fail, redirect } from '@sveltejs/kit';
import { instance } from '$lib/server/instance';
import { addItemsToList, collectListIngredients, listPrepRecipes } from '$lib/server/recipes';
import { changesSince } from '$lib/server/sync';
import { publish } from '$lib/server/events';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { db } = await instance();
	return { recipes: listPrepRecipes(db) };
};

export const actions: Actions = {
	ingredients: async ({ request }) => {
		const { db } = await instance();
		const ids = (await request.formData()).getAll('recipeId').map(String);
		if (!ids.length) return fail(400, { error: 'Pick at least one recipe.' });
		const seen = new Set<string>();
		const items: { name: string; item_id: string | null }[] = [];
		for (const id of ids) {
			for (const it of collectListIngredients(db, id)) {
				const key = it.name.toLowerCase();
				if (seen.has(key)) continue;
				seen.add(key);
				items.push(it);
			}
		}
		return { ids, items };
	},
	addToList: async ({ request }) => {
		const { db } = await instance();
		const names = (await request.formData()).getAll('name').map(String);
		if (!names.length) redirect(303, '/prep');
		const items = names.map((name) => ({ name, item_id: null }));
		const added = addItemsToList(db, items);
		if (added) publish(changesSince(db, 0).cursor);
		redirect(303, '/recipes');
	}
};
