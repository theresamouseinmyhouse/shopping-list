// Recipe shapes + small view helpers, shared by the editor, the server module and
// AI import. Parsing lives in ./recipe-parse.ts (which imports this file).
//
// A recipe has ONE canonical ingredient list. Steps are prose; an ingredient is
// "used in" a step when its name appears in that step's text (derived at save
// time) — plus any explicit picks. `RecipeInput` is the transport shape.

import { normalizeName } from './types';
import { uuid } from './client/uuid';
import { canonicalizeUnit, formatAmount } from './units';

export interface RecipeIngredient {
	/** transport id — steps reference ingredients by this; remapped to a row id on save */
	id: string;
	quantity: string;
	unit: string;
	/** alternate measure (e.g. volume when `quantity`/`unit` is a weight) */
	quantity2: string;
	unit2: string;
	/** show / use the alternate measure first */
	preferAlt: boolean;
	name: string;
	/** prep note kept out of the name: "sifted", "diced", "at room temperature" */
	comment: string;
	/** section header this ingredient sits under: "For the sauce" */
	group: string;
}

export interface RecipeStep {
	body: string;
	group: string;
	/** explicit extra ingredient links (prose matches are added automatically on save) */
	ingredientIds: string[];
	/** titles of sub-recipes embedded under this step */
	includes: string[];
}

export interface RecipeInput {
	title: string;
	servings: string;
	notes: string;
	source_url: string;
	ingredients: RecipeIngredient[];
	/** sub-recipes not tied to any step (the "components" block) */
	miseEnPlaceIncludes: string[];
	steps: RecipeStep[];
}

export function emptyRecipeInput(): RecipeInput {
	return {
		title: '',
		servings: '',
		notes: '',
		source_url: '',
		ingredients: [],
		miseEnPlaceIncludes: [],
		steps: []
	};
}

export function blankIngredient(): RecipeIngredient {
	return {
		id: uuid(),
		quantity: '',
		unit: '',
		quantity2: '',
		unit2: '',
		preferAlt: false,
		name: '',
		comment: '',
		group: ''
	};
}

export function blankStep(): RecipeStep {
	return { body: '', group: '', ingredientIds: [], includes: [] };
}

/** Does this ingredient carry two measurements? (drives the post-import chooser) */
export function hasDualMeasure(i: RecipeIngredient): boolean {
	return !!(i.quantity || i.unit) && !!(i.quantity2 || i.unit2);
}

/** Primary + secondary display strings, honouring `preferAlt`. */
export function displayAmount(i: {
	quantity: string;
	unit: string;
	quantity2: string;
	unit2: string;
	preferAlt: boolean;
}): { main: string; alt: string } {
	const a = formatAmount(i.quantity, i.unit);
	const b = formatAmount(i.quantity2, i.unit2);
	if (i.preferAlt && b) return { main: b, alt: a };
	return { main: a, alt: b };
}

// ---------------------------------------------------------------------------
// Resolved view model (server builds it; the view + print pages render it).
// ---------------------------------------------------------------------------

export interface ResolvedIngredient {
	id: string;
	quantity: string;
	unit: string;
	quantity2: string;
	unit2: string;
	preferAlt: boolean;
	name: string;
	comment: string;
	group: string;
	item_id: string | null;
}
export interface ResolvedStep {
	id: string;
	body: string;
	group: string;
	ingredients: ResolvedIngredient[];
	children: ResolvedChild[];
}
export interface ResolvedRecipe {
	id: string;
	title: string;
	servings: string;
	notes: string;
	source_url: string;
	ingredients: ResolvedIngredient[];
	steps: ResolvedStep[];
	components: ResolvedChild[];
}
export type ResolvedChild =
	| { kind: 'recipe'; recipe: ResolvedRecipe }
	| { kind: 'cycle'; title: string }
	| { kind: 'missing'; title: string };

// ---------------------------------------------------------------------------
// coerceRecipeInput — validate/normalise an untrusted object (parsed form JSON)
// ---------------------------------------------------------------------------

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

function coerceIngredient(v: unknown): RecipeIngredient {
	const o = (v ?? {}) as Record<string, unknown>;
	return {
		id: str(o.id) || uuid(),
		quantity: str(o.quantity).trim(),
		unit: canonicalizeUnit(str(o.unit)),
		quantity2: str(o.quantity2).trim(),
		unit2: canonicalizeUnit(str(o.unit2)),
		preferAlt: !!o.preferAlt,
		name: str(o.name).trim(),
		comment: str(o.comment).trim(),
		group: str(o.group).trim()
	};
}

export function coerceRecipeInput(raw: unknown): RecipeInput {
	const o = (raw ?? {}) as Record<string, unknown>;
	const ingredients = (Array.isArray(o.ingredients) ? o.ingredients : [])
		.map(coerceIngredient)
		.filter((i) => i.name);
	const ids = new Set(ingredients.map((i) => i.id));
	const steps = (Array.isArray(o.steps) ? o.steps : []).map((s) => {
		const st = (s ?? {}) as Record<string, unknown>;
		return {
			body: str(st.body),
			group: str(st.group).trim(),
			ingredientIds: (Array.isArray(st.ingredientIds) ? st.ingredientIds : [])
				.map(str)
				.filter((id) => ids.has(id)),
			includes: (Array.isArray(st.includes) ? st.includes : []).map(str).map((s) => s.trim()).filter(Boolean)
		};
	});
	return {
		title: str(o.title).trim(),
		servings: str(o.servings).trim(),
		notes: str(o.notes),
		source_url: str(o.source_url).trim(),
		ingredients,
		miseEnPlaceIncludes: (Array.isArray(o.miseEnPlaceIncludes) ? o.miseEnPlaceIncludes : [])
			.map(str)
			.map((s) => s.trim())
			.filter(Boolean),
		steps
	};
}

// ---------------------------------------------------------------------------
// flattenIngredients — the shopping-list view of a recipe: its whole ingredient
// list, deduped by normalized name.
// ---------------------------------------------------------------------------

export function flattenIngredients(input: { ingredients: { name: string }[] }): { name: string }[] {
	const seen = new Set<string>();
	const out: { name: string }[] = [];
	for (const ing of input.ingredients) {
		const key = normalizeName(ing.name);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(ing);
	}
	return out;
}

// ---------------------------------------------------------------------------
// linkStepIngredients — which ingredients does a step's prose mention?
// Used by the server at save time and the editor for live chips.
// ---------------------------------------------------------------------------

// "flour your hands", "flour the (pizza) peel", "dust the surface" — the word is a
// technique here, not an ingredient of the step. Matches "<word> [your/the/a]
// [adjective] <work-surface noun>". Deliberately excludes cooking vessels
// (pan/tin/dish) so "melt the butter in a pan" still links.
const TECHNIQUE_AFTER =
	/^(?:your |the |a |onto |over )*(?:\w+ )?(?:hands?|surface|board|counter|countertop|worktop|peel|table|work)\b/;

/** Ingredient ids whose name (used as a noun, not a technique) appears in `prose`. */
export function matchIngredientsInProse(
	prose: string,
	ingredients: { id: string; name: string }[]
): string[] {
	const hay = ` ${normalizeName(prose).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
	if (hay.trim().length < 2) return [];
	const out: string[] = [];
	for (const ing of ingredients) {
		const n = normalizeName(ing.name).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
		if (!n) continue;
		const head = n;
		if (head.length < 3) continue;
		const words = [head];
		const last = head.split(' ').pop();
		if (last && last !== head && last.length > 3) words.push(last);

		let hit = false;
		for (const w of words) {
			for (let i = hay.indexOf(` ${w} `); i !== -1 && !hit; i = hay.indexOf(` ${w} `, i + 1)) {
				if (!TECHNIQUE_AFTER.test(hay.slice(i + w.length + 2))) hit = true;
			}
			if (hit) break;
		}
		if (hit) out.push(ing.id);
	}
	return out;
}
