import { error, fail, redirect } from '@sveltejs/kit';
import { instance } from '$lib/server/instance';
import {
	addItemsToList,
	collectListIngredients,
	deleteRecipe,
	getRecipe,
	resolveRecipeTree
} from '$lib/server/recipes';
import { changesSince } from '$lib/server/sync';
import { publish } from '$lib/server/events';
import { normalizeName } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { db } = await instance();
	const tree = resolveRecipeTree(db, params.id);
	if (!tree) throw error(404, 'recipe not found');
	// candidates for the "Add to list" chooser: every ingredient incl. sub-recipes
	return { tree, candidates: collectListIngredients(db, params.id) };
};

export const actions: Actions = {
	addToList: async ({ params, request }) => {
		const { db } = await instance();
		if (!getRecipe(db, params.id)) throw error(404, 'recipe not found');
		const wanted = new Set((await request.formData()).getAll('name').map((n) => normalizeName(String(n))));
		const chosen = collectListIngredients(db, params.id).filter((c) =>
			wanted.has(normalizeName(c.name))
		);
		const added = addItemsToList(db, chosen);
		if (added) publish(changesSince(db, 0).cursor);
		return { added };
	},
	delete: async ({ params }) => {
		const { db } = await instance();
		if (!getRecipe(db, params.id)) return fail(404);
		deleteRecipe(db, params.id);
		throw redirect(303, '/recipes');
	}
};
