import { instance } from '$lib/server/instance';
import { listRecipes, listPrepRecipes } from '$lib/server/recipes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { db } = await instance();
	return { recipes: listRecipes(db), prepRecipes: listPrepRecipes(db) };
};
