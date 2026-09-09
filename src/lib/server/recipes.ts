// Server-side recipe store. Plain relational CRUD over the 0005/0006 tables —
// recipes are NOT part of the offline op/sync stream. "Add to list" is the one
// crossover: it emits `add_item` ops through the normal sync path.

import { generateKeyBetween } from 'fractional-indexing';
import type { DB } from './db';
import { applyOps, matchCatalogItem } from './sync';
import { GLOBAL, normalizeName, type Op } from '../types';
import { uuid } from '../client/uuid';
import { nameVariants } from '../quantity';
import { formatAmount } from '../units';
import {
	flattenIngredients,
	matchIngredientsInProse,
	type RecipeInput,
	type RecipeIngredient,
	type ResolvedRecipe,
	type ResolvedChild,
	type ResolvedIngredient
} from '../recipe';

export interface RecipeRow {
	id: string;
	title: string;
	title_norm: string;
	servings: string;
	notes: string;
	source_url: string;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
}

export interface StepRow {
	id: string;
	recipe_id: string;
	ord: number;
	group_label: string;
	body: string;
}

export interface IngredientRow {
	id: string;
	recipe_id: string;
	ord: number;
	amount: string;
	quantity: string;
	unit: string;
	quantity2: string;
	unit2: string;
	prefer_alt: 0 | 1;
	name: string;
	comment: string;
	group_label: string;
	item_id: string | null;
}

export interface LinkRow {
	id: string;
	recipe_id: string;
	child_recipe_id: string;
	ord: number;
	step_id: string | null;
}

export interface StepIngredientRow {
	step_id: string;
	ingredient_id: string;
	ord: number;
}

export interface FullRecipe {
	recipe: RecipeRow;
	steps: StepRow[];
	ingredients: IngredientRow[];
	links: LinkRow[];
	stepIngredients: StepIngredientRow[];
}

export function listRecipes(db: DB): { id: string; title: string; servings: string }[] {
	return db
		.prepare(
			`SELECT id, title, servings FROM recipes WHERE deleted_at IS NULL
			 ORDER BY title COLLATE NOCASE`
		)
		.all() as { id: string; title: string; servings: string }[];
}

/** Live catalog item names, for the editor's ingredient autocomplete. */
export function catalogNames(db: DB): string[] {
	return (
		db
			.prepare(`SELECT name FROM items WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE`)
			.all() as { name: string }[]
	).map((r) => r.name);
}

export function getRecipe(db: DB, id: string): FullRecipe | null {
	const recipe = db
		.prepare(`SELECT * FROM recipes WHERE id = ? AND deleted_at IS NULL`)
		.get(id) as RecipeRow | undefined;
	if (!recipe) return null;
	const steps = db
		.prepare(`SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY ord`)
		.all(id) as StepRow[];
	const stepIds = steps.map((s) => s.id);
	return {
		recipe,
		steps,
		ingredients: db
			.prepare(`SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY ord`)
			.all(id) as IngredientRow[],
		links: db
			.prepare(`SELECT * FROM recipe_links WHERE recipe_id = ? ORDER BY ord`)
			.all(id) as LinkRow[],
		stepIngredients: stepIds.length
			? (db
					.prepare(
						`SELECT * FROM recipe_step_ingredients
						 WHERE step_id IN (${stepIds.map(() => '?').join(',')}) ORDER BY ord`
					)
					.all(...stepIds) as StepIngredientRow[])
			: []
	};
}

function ingToTransport(i: IngredientRow): RecipeIngredient {
	return {
		id: i.id,
		quantity: i.quantity,
		unit: i.unit,
		quantity2: i.quantity2,
		unit2: i.unit2,
		preferAlt: !!i.prefer_alt,
		name: i.name,
		comment: i.comment,
		group: i.group_label
	};
}

/** Turn stored rows back into the editor's transport shape. */
export function fullRecipeToInput(db: DB, full: FullRecipe): RecipeInput {
	const titleOf = new Map<string, string>();
	for (const l of full.links) {
		if (!titleOf.has(l.child_recipe_id)) {
			const row = db.prepare(`SELECT title FROM recipes WHERE id = ?`).get(l.child_recipe_id) as
				| { title: string }
				| undefined;
			titleOf.set(l.child_recipe_id, row?.title ?? '');
		}
	}
	const incFor = (stepId: string | null) =>
		full.links
			.filter((l) => l.step_id === stepId)
			.map((l) => titleOf.get(l.child_recipe_id) ?? '')
			.filter(Boolean);
	const refsFor = (stepId: string) =>
		full.stepIngredients.filter((si) => si.step_id === stepId).map((si) => si.ingredient_id);
	return {
		title: full.recipe.title,
		servings: full.recipe.servings,
		notes: full.recipe.notes,
		source_url: full.recipe.source_url,
		ingredients: full.ingredients.map(ingToTransport),
		miseEnPlaceIncludes: incFor(null),
		steps: full.steps.map((s) => ({
			body: s.body,
			group: s.group_label,
			ingredientIds: refsFor(s.id),
			includes: incFor(s.id)
		}))
	};
}

/** Insert (id null) or replace a recipe and all its children in one transaction. */
export function saveRecipe(db: DB, id: string | null, input: RecipeInput): string {
	const now = Date.now();
	const recipeId = id ?? uuid();
	const titleNorm = normalizeName(input.title);

	const tx = db.transaction(() => {
		const exists = id ? db.prepare(`SELECT 1 FROM recipes WHERE id = ?`).get(id) : null;
		if (exists) {
			db.prepare(
				`UPDATE recipes SET title = ?, title_norm = ?, servings = ?, notes = ?,
				   source_url = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`
			).run(input.title.trim(), titleNorm, input.servings.trim(), input.notes, input.source_url.trim(), now, recipeId);
			const oldSteps = db.prepare(`SELECT id FROM recipe_steps WHERE recipe_id = ?`).all(recipeId) as {
				id: string;
			}[];
			for (const s of oldSteps)
				db.prepare(`DELETE FROM recipe_step_ingredients WHERE step_id = ?`).run(s.id);
			db.prepare(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`).run(recipeId);
			db.prepare(`DELETE FROM recipe_links WHERE recipe_id = ?`).run(recipeId);
			db.prepare(`DELETE FROM recipe_steps WHERE recipe_id = ?`).run(recipeId);
		} else {
			db.prepare(
				`INSERT INTO recipes (id, title, title_norm, servings, notes, source_url, created_at, updated_at, deleted_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
			).run(recipeId, input.title.trim(), titleNorm, input.servings.trim(), input.notes, input.source_url.trim(), now, now);
		}

		// steps
		const stepIds: string[] = [];
		const insStep = db.prepare(
			`INSERT INTO recipe_steps (id, recipe_id, ord, group_label, body) VALUES (?, ?, ?, ?, ?)`
		);
		input.steps.forEach((s, i) => {
			const sid = uuid();
			stepIds.push(sid);
			insStep.run(sid, recipeId, i, s.group.trim(), s.body.trim());
		});

		// canonical ingredient list; remember transport-id -> row-id
		const rowIdOf = new Map<string, string>();
		const insIng = db.prepare(
			`INSERT INTO recipe_ingredients
			   (id, recipe_id, ord, amount, quantity, unit, quantity2, unit2, prefer_alt, name, comment, group_label, item_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		);
		const savedIngredients: { id: string; name: string }[] = [];
		input.ingredients.forEach((ing, i) => {
			const name = ing.name.trim();
			if (!name) return;
			const rowId = uuid();
			rowIdOf.set(ing.id, rowId);
			savedIngredients.push({ id: rowId, name });
			insIng.run(
				rowId,
				recipeId,
				i,
				formatAmount(ing.quantity, ing.unit),
				ing.quantity.trim(),
				ing.unit.trim(),
				ing.quantity2.trim(),
				ing.unit2.trim(),
				ing.preferAlt ? 1 : 0,
				name,
				ing.comment.trim(),
				ing.group.trim(),
				matchCatalogItem(db, name)
			);
		});

		// step <-> ingredient links: prose mentions + explicit picks
		const insSI = db.prepare(
			`INSERT OR IGNORE INTO recipe_step_ingredients (step_id, ingredient_id, ord) VALUES (?, ?, ?)`
		);
		input.steps.forEach((s, si) => {
			const fromProse = matchIngredientsInProse(s.body, savedIngredients);
			const explicit = s.ingredientIds
				.map((tid) => rowIdOf.get(tid))
				.filter((x): x is string => !!x);
			[...new Set([...fromProse, ...explicit])].forEach((rid, k) => insSI.run(stepIds[si], rid, k));
		});

		// sub-recipe links
		const insLink = db.prepare(
			`INSERT INTO recipe_links (id, recipe_id, child_recipe_id, ord, step_id) VALUES (?, ?, ?, ?, ?)`
		);
		let lord = 0;
		const addLink = (title: string, stepId: string | null) => {
			const childId = findRecipeIdByTitle(db, title, recipeId);
			if (childId) {
				insLink.run(uuid(), recipeId, childId, lord++, stepId);
			} else if (stepId) {
				const row = db.prepare(`SELECT body FROM recipe_steps WHERE id = ?`).get(stepId) as
					| { body: string }
					| undefined;
				if (row !== undefined) {
					const body = row.body ? `${row.body}\n(includes: ${title.trim()})` : `(includes: ${title.trim()})`;
					db.prepare(`UPDATE recipe_steps SET body = ? WHERE id = ?`).run(body, stepId);
				}
			}
		};
		for (const t of input.miseEnPlaceIncludes) addLink(t, null);
		input.steps.forEach((s, i) => {
			for (const t of s.includes) addLink(t, stepIds[i]);
		});
	});
	tx();
	return recipeId;
}

export function deleteRecipe(db: DB, id: string): void {
	db.prepare(`UPDATE recipes SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(
		Date.now(),
		Date.now(),
		id
	);
}

function findRecipeIdByTitle(db: DB, title: string, excludeId: string): string | null {
	const norm = normalizeName(title);
	if (!norm) return null;
	const norms = [...new Set(nameVariants(title).map(normalizeName))].filter(Boolean);
	const rows = db
		.prepare(
			`SELECT id, title_norm FROM recipes
			 WHERE deleted_at IS NULL AND id != ? AND title_norm IN (${norms.map(() => '?').join(',')})`
		)
		.all(excludeId, ...norms) as { id: string; title_norm: string }[];
	const hit = rows.find((r) => r.title_norm === norm) ?? rows[0];
	return hit ? hit.id : null;
}

// ---------------------------------------------------------------------------
// Resolved tree — a recipe with each sub-recipe link expanded inline.
// ---------------------------------------------------------------------------

function ingToResolved(i: IngredientRow): ResolvedIngredient {
	return {
		id: i.id,
		quantity: i.quantity,
		unit: i.unit,
		quantity2: i.quantity2,
		unit2: i.unit2,
		preferAlt: !!i.prefer_alt,
		name: i.name,
		comment: i.comment,
		group: i.group_label,
		item_id: i.item_id
	};
}

export function resolveRecipeTree(
	db: DB,
	id: string,
	visited: Set<string> = new Set()
): ResolvedRecipe | null {
	const full = getRecipe(db, id);
	if (!full) return null;
	visited.add(id);

	const child = (link: LinkRow): ResolvedChild => {
		const childRow = db
			.prepare(`SELECT title FROM recipes WHERE id = ?`)
			.get(link.child_recipe_id) as { title: string } | undefined;
		const title = childRow?.title ?? '(deleted recipe)';
		if (visited.has(link.child_recipe_id)) return { kind: 'cycle', title };
		const resolved = resolveRecipeTree(db, link.child_recipe_id, new Set(visited));
		if (!resolved) return { kind: 'missing', title };
		return { kind: 'recipe', recipe: resolved };
	};

	const byId = new Map(full.ingredients.map((i) => [i.id, i]));
	const linksFor = (stepId: string | null) => full.links.filter((l) => l.step_id === stepId);

	return {
		id: full.recipe.id,
		title: full.recipe.title,
		servings: full.recipe.servings,
		notes: full.recipe.notes,
		source_url: full.recipe.source_url,
		ingredients: full.ingredients.map(ingToResolved),
		steps: full.steps.map((s) => ({
			id: s.id,
			body: s.body,
			group: s.group_label,
			ingredients: full.stepIngredients
				.filter((si) => si.step_id === s.id)
				.map((si) => byId.get(si.ingredient_id))
				.filter((x): x is IngredientRow => !!x)
				.map(ingToResolved),
			children: linksFor(s.id).map(child)
		})),
		components: linksFor(null).map(child)
	};
}

// ---------------------------------------------------------------------------
// collectListIngredients — every ingredient of this recipe + nested sub-recipes,
// deduped, tagged with a catalog id where one matches. Feeds "Add to list".
// ---------------------------------------------------------------------------

export function collectListIngredients(
	db: DB,
	id: string
): { name: string; item_id: string | null }[] {
	const seen = new Set<string>();
	const out: { name: string; item_id: string | null }[] = [];

	const walk = (rid: string, visited: Set<string>) => {
		if (visited.has(rid)) return;
		visited.add(rid);
		const full = getRecipe(db, rid);
		if (!full) return;
		for (const ing of flattenIngredients({ ingredients: full.ingredients })) {
			const key = normalizeName(ing.name);
			if (!key || seen.has(key)) continue;
			seen.add(key);
			const matched = full.ingredients.find((i) => normalizeName(i.name) === key);
			out.push({ name: ing.name, item_id: matched?.item_id ?? matchCatalogItem(db, ing.name) });
		}
		for (const link of full.links) walk(link.child_recipe_id, new Set(visited));
	};

	walk(id, new Set());
	return out;
}

/**
 * Push a chosen set of ingredients onto the shared list via normal `add_item` ops
 * (which upsert the catalog item). Returns the number added. The caller is
 * responsible for `publish(...)` afterwards so open clients re-sync.
 */
export function addItemsToList(db: DB, items: { name: string; item_id: string | null }[]): number {
	if (!items.length) return 0;
	let pos = (
		db.prepare(`SELECT MAX(position) AS p FROM placements WHERE scope_place_id = ''`).get() as {
			p: string | null;
		}
	).p;
	const ops: Op[] = items.map((it) => {
		pos = generateKeyBetween(pos ?? null, null);
		return {
			id: uuid(),
			ts: Date.now(),
			type: 'add_item',
			item_id: it.item_id ?? uuid(),
			name: it.name,
			position: pos,
			scope_place_id: GLOBAL,
			qty: 1
		};
	});
	applyOps(db, ops);
	return ops.length;
}
