import { error, redirect } from '@sveltejs/kit';
import { instance } from '$lib/server/instance';
import { catalogNames, listRecipes, saveRecipe } from '$lib/server/recipes';
import { aiConfigured } from '$lib/server/recipe-import';
import { coerceRecipeInput } from '$lib/recipe';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { db } = await instance();
	return { recipes: listRecipes(db), catalog: catalogNames(db), ai: aiConfigured() };
};

export const actions: Actions = {
	default: async ({ request }) => {
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
		const id = saveRecipe(db, null, input);
		throw redirect(303, `/recipes/${id}`);
	}
};
