import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import { openDb, type DB } from './db';
import { applyOps } from './sync';
import { GLOBAL, type Op } from '../types';
import { emptyRecipeInput, blankIngredient, blankStep, type RecipeInput, type RecipeIngredient } from '../recipe';
import {
	saveRecipe,
	getRecipe,
	listRecipes,
	deleteRecipe,
	fullRecipeToInput,
	resolveRecipeTree,
	collectListIngredients,
	addItemsToList
} from './recipes';

let db: DB;
beforeEach(() => {
	db = openDb(':memory:');
});

function ing(name: string, over: Partial<RecipeIngredient> = {}): RecipeIngredient {
	return { ...blankIngredient(), name, ...over };
}
function step(body: string, over: Partial<RecipeInput['steps'][number]> = {}) {
	return { ...blankStep(), body, ...over };
}
function input(over: Partial<RecipeInput> = {}): RecipeInput {
	return { ...emptyRecipeInput(), title: 'Test', ...over };
}

let seq = 0;
function seedCatalogItem(name: string) {
	seq++;
	applyOps(db, [
		{
			id: `op-${seq}`,
			ts: Date.now(),
			type: 'add_item',
			item_id: `i${seq}`,
			name,
			position: generateKeyBetween(null, null),
			scope_place_id: GLOBAL
		} as Op
	]);
}

describe('saveRecipe / getRecipe', () => {
	it('round-trips ingredients (with comment/group) and derives step links from prose', () => {
		const id = saveRecipe(
			db,
			null,
			input({
				title: 'Bread',
				ingredients: [
					ing('flour', { quantity: '2', unit: 'cup', group: 'Dry' }),
					ing('salt', { quantity: '1', unit: 'tsp', group: 'Dry', comment: 'fine' })
				],
				steps: [step('Whisk the flour and salt together.'), step('Knead for 10 minutes.')]
			})
		);
		const full = getRecipe(db, id)!;
		expect(full.ingredients.map((i) => [i.name, i.group_label, i.comment])).toEqual([
			['flour', 'Dry', ''],
			['salt', 'Dry', 'fine']
		]);
		// step 1 mentions both, step 2 mentions neither
		const s1 = full.steps[0].id;
		expect(full.stepIngredients.filter((x) => x.step_id === s1)).toHaveLength(2);
		expect(full.stepIngredients).toHaveLength(2);

		const back = fullRecipeToInput(db, full);
		expect(back.ingredients[1]).toMatchObject({ comment: 'fine', group: 'Dry' });
	});

	it('editing replaces everything with no orphans', () => {
		const id = saveRecipe(db, null, input({ ingredients: [ing('apple')], steps: [step('slice the apple')] }));
		saveRecipe(db, id, input({ ingredients: [ing('banana')], steps: [step('mash the banana')] }));
		const full = getRecipe(db, id)!;
		expect(full.ingredients.map((i) => i.name)).toEqual(['banana']);
		expect(db.prepare(`SELECT COUNT(*) AS n FROM recipe_step_ingredients`).get()).toEqual({ n: 1 });
	});

	it('links to a matching catalog item (via alias) but does not create one for a new ingredient', () => {
		seedCatalogItem('Sugar');
		db.prepare(`INSERT INTO item_aliases (alias_norm, item_id, created_at) VALUES ('granulated sugar', 'i1', 0)`).run();
		const before = db.prepare(`SELECT COUNT(*) AS n FROM items`).get() as { n: number };
		const id = saveRecipe(db, null, input({ ingredients: [ing('granulated sugar'), ing('saffron threads')] }));
		const byName = Object.fromEntries(getRecipe(db, id)!.ingredients.map((i) => [i.name, i.item_id]));
		expect(byName['granulated sugar']).toBe('i1'); // alias -> existing "Sugar"
		expect(byName['saffron threads']).toBeNull(); // new ingredient is NOT auto-added to the catalog
		expect(db.prepare(`SELECT COUNT(*) AS n FROM items`).get()).toEqual({ n: before.n });
	});

	it('dual-measure fields survive the round trip', () => {
		const f = ing('flour', { quantity: '1 1/2', unit: 'cup', quantity2: '190', unit2: 'g', preferAlt: true });
		const id = saveRecipe(db, null, input({ ingredients: [f] }));
		const r = fullRecipeToInput(db, getRecipe(db, id)!);
		expect(r.ingredients[0]).toMatchObject({ quantity: '1 1/2', unit: 'cup', quantity2: '190', unit2: 'g', preferAlt: true });
	});
});

describe('sub-recipe links + resolveRecipeTree', () => {
	it('embeds a child recipe inline and guards cycles', () => {
		saveRecipe(db, null, input({ title: 'Gravy', ingredients: [ing('flour', { quantity: '2', unit: 'tbsp' })] }));
		const pie = saveRecipe(db, null, input({ title: 'Pie', steps: [step('Assemble it all.', { includes: ['Gravy'] })] }));
		const tree = resolveRecipeTree(db, pie)!;
		const c = tree.steps[0].children[0];
		expect(c.kind).toBe('recipe');
		if (c.kind === 'recipe') expect(c.recipe.ingredients[0].name).toBe('flour');
	});

	it('unmatched includes title falls into the step body', () => {
		const p = saveRecipe(db, null, input({ steps: [step('do it', { includes: ['Nope'] })] }));
		expect(getRecipe(db, p)!.steps[0].body).toContain('(includes: Nope)');
	});

	it('an includes title matches a recipe by singular/plural variant', () => {
		const bits = saveRecipe(db, null, input({ title: 'Vegan Bacon Bits' }));
		const salt = saveRecipe(db, null, input({ title: 'Broccoli Salad', steps: [step('toss', { includes: ['vegan bacon bit'] })] }));
		expect(getRecipe(db, salt)!.links.map((l) => l.child_recipe_id)).toEqual([bits]);
	});
});

describe('collectListIngredients / addItemsToList', () => {
	it('flattens nested sub-recipe ingredients, deduped', () => {
		saveRecipe(db, null, input({ title: 'Gravy', ingredients: [ing('Flour'), ing('stock')] }));
		const pie = saveRecipe(
			db,
			null,
			input({
				title: 'Pie',
				ingredients: [ing('flour'), ing('potato')],
				steps: [step('layer it', { includes: ['Gravy'] })]
			})
		);
		expect(collectListIngredients(db, pie).map((i) => i.name.toLowerCase()).sort()).toEqual([
			'flour',
			'potato',
			'stock'
		]);
	});

	it('addItemsToList adds only the chosen items, reusing catalog matches', () => {
		seedCatalogItem('Potato');
		const pie = saveRecipe(db, null, input({ title: 'Pie', ingredients: [ing('potato'), ing('lamb'), ing('water')] }));
		const cands = collectListIngredients(db, pie);
		const chosen = cands.filter((c) => c.name !== 'water'); // user unticks water
		expect(addItemsToList(db, chosen)).toBe(2);
		expect(
			db.prepare(`SELECT i.name FROM list_state ls JOIN items i ON i.id = ls.item_id WHERE ls.on_list = 1 ORDER BY i.name`).all()
		).toEqual([{ name: 'Potato' }, { name: 'lamb' }]);
		// 'lamb' created (added), 'water' never entered the catalog
		expect(db.prepare(`SELECT COUNT(*) AS n FROM items`).get()).toEqual({ n: 2 });
	});
});

describe('deleteRecipe', () => {
	it('hides the recipe', () => {
		const id = saveRecipe(db, null, input({ title: 'Temp' }));
		deleteRecipe(db, id);
		expect(getRecipe(db, id)).toBeNull();
		expect(listRecipes(db)).toHaveLength(0);
	});
});
