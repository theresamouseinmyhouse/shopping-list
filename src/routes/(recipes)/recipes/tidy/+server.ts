import { error, json } from '@sveltejs/kit';
import { coerceRecipeInput } from '$lib/recipe';
import { instance } from '$lib/server/instance';
import { aiConfigured, ImportError, tidyRecipe } from '$lib/server/recipe-import';
import type { RequestHandler } from './$types';

// Editor "Tidy with AI" — takes the current recipe as JSON, returns a cleaned one.
// Auth is enforced by hooks.server.ts (non-public path); JSON body so the CSRF
// form-check doesn't apply.
export const POST: RequestHandler = async ({ request }) => {
	const { db } = await instance();
	if (!aiConfigured(db)) throw error(400, 'AI is not configured');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'bad json');
	}
	const b = (body ?? {}) as Record<string, unknown>;
	const input = coerceRecipeInput(b.recipe ?? body);
	const instruction = typeof b.instruction === 'string' ? b.instruction : '';
	if (!input.ingredients.length && !input.steps.length) throw error(400, 'nothing to tidy');
	try {
		return json({ recipe: await tidyRecipe(db, input, instruction) });
	} catch (e) {
		throw error(e instanceof ImportError ? 422 : 500, e instanceof Error ? e.message : 'tidy failed');
	}
};
