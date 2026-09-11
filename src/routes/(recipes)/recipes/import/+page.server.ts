import { fail } from '@sveltejs/kit';
import { instance } from '$lib/server/instance';
import { catalogNames, listRecipes } from '$lib/server/recipes';
import {
	aiConfigured,
	generateFromDescription,
	importFromImage,
	importFromText,
	importFromTextWithAi,
	importFromUrl,
	importFromUrlWithAi,
	ImportError,
	type ImportResult
} from '$lib/server/recipe-import';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { db } = await instance();
	return { recipes: listRecipes(db), catalog: catalogNames(db), ai: aiConfigured(db) };
};

function done(r: ImportResult) {
	return { draft: r.draft, method: r.method, thin: r.thin };
}
function caught(e: unknown) {
	return fail(e instanceof ImportError ? 422 : 500, {
		error: e instanceof Error ? e.message : 'Import failed.'
	});
}

export const actions: Actions = {
	url: async ({ request }) => {
		const url = String((await request.formData()).get('url') ?? '').trim();
		if (!url) return fail(400, { error: 'Enter a URL.' });
		try {
			return done(await importFromUrl(url));
		} catch (e) {
			return caught(e);
		}
	},
	text: async ({ request }) => {
		const text = String((await request.formData()).get('text') ?? '').trim();
		if (!text) return fail(400, { error: 'Paste a recipe.' });
		return done(importFromText(text));
	},
	aiUrl: async ({ request }) => {
		const { db } = await instance();
		const url = String((await request.formData()).get('url') ?? '').trim();
		if (!url) return fail(400, { error: 'Enter a URL.' });
		try {
			return done(await importFromUrlWithAi(db, url));
		} catch (e) {
			return caught(e);
		}
	},
	aiText: async ({ request }) => {
		const { db } = await instance();
		const text = String((await request.formData()).get('text') ?? '').trim();
		if (!text) return fail(400, { error: 'Paste a recipe.' });
		try {
			return done(await importFromTextWithAi(db, text));
		} catch (e) {
			return caught(e);
		}
	},
	photo: async ({ request }) => {
		const { db } = await instance();
		const file = (await request.formData()).get('photo');
		if (!(file instanceof File) || !file.size) return fail(400, { error: 'Choose a photo.' });
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			return done(await importFromImage(db, bytes, file.type));
		} catch (e) {
			return caught(e);
		}
	},
	generate: async ({ request }) => {
		const { db } = await instance();
		const description = String((await request.formData()).get('description') ?? '').trim();
		if (!description) return fail(400, { error: 'Describe the recipe you want.' });
		try {
			return done(await generateFromDescription(db, description));
		} catch (e) {
			return caught(e);
		}
	}
};
