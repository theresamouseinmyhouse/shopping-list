import { error, redirect } from '@sveltejs/kit';
import { instance } from '$lib/server/instance';
import {
	catalogNames,
	fullRecipeToInput,
	getRecipe,
	listRecipes,
	saveRecipe
} from '$lib/server/recipes';
import { aiConfigured } from '$lib/server/recipe-import';
import { coerceRecipeInput } from '$lib/recipe';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { db } = await instance();
	const full = getRecipe(db, params.id);
	if (!full) throw error(404, 'recipe not found');
	return {
		id: params.id,
		initial: fullRecipeToInput(db, full),
		recipes: listRecipes(db).filter((r) => r.id !== params.id),
		catalog: catalogNames(db),
		ai: aiConfigured()
	};
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const { db } = await instance();
		const fd = await request.formData();
		let raw: unknown;
		try {
			raw = JSON.parse(String(fd.get('payload') ?? '{}'));
		} catch {
			throw error(400, 'bad payload');
		}
		const input = coerceRecipeInput(raw);
		if (!input.title) throw error(400, 'a title is required');
		if (!getRecipe(db, params.id)) throw error(404, 'recipe not found');
		saveRecipe(db, params.id, input);
		throw redirect(303, `/recipes/${params.id}`);
	}
};
