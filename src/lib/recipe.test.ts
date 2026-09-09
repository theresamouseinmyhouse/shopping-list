import { describe, it, expect } from 'vitest';
import { coerceRecipeInput, flattenIngredients, matchIngredientsInProse, displayAmount } from './recipe';

describe('coerceRecipeInput', () => {
	it('canonicalises units, keeps comment/group, drops nameless ingredients', () => {
		const r = coerceRecipeInput({
			title: '  Cake  ',
			ingredients: [
				{ id: 'a', quantity: '2', unit: 'Cups', name: 'flour', comment: 'sifted', group: 'Dry' },
				{ id: 'b', quantity: '1', unit: 'teaspoon', name: '' }
			],
			steps: [{ body: 'Mix', group: '', ingredientIds: ['a', 'ghost'], includes: ['Frosting'] }]
		});
		expect(r.title).toBe('Cake');
		expect(r.ingredients).toHaveLength(1);
		expect(r.ingredients[0]).toMatchObject({ unit: 'cup', comment: 'sifted', group: 'Dry' });
		expect(r.steps[0].ingredientIds).toEqual(['a']);
		expect(r.steps[0].includes).toEqual(['Frosting']);
	});
});

describe('flattenIngredients', () => {
	it('dedupes by normalized name', () => {
		expect(
			flattenIngredients({ ingredients: [{ name: 'Flour' }, { name: 'flour' }, { name: 'Sugar' }] }).map(
				(i) => i.name
			)
		).toEqual(['Flour', 'Sugar']);
	});
});

describe('matchIngredientsInProse', () => {
	it('links ingredients whose name appears in the step text', () => {
		const ings = [
			{ id: '1', name: 'ground beef' },
			{ id: '2', name: 'yellow onion' },
			{ id: '3', name: 'bay leaf' }
		];
		expect(matchIngredientsInProse('Brown the beef, then add the onion.', ings).sort()).toEqual(['1', '2']);
		expect(matchIngredientsInProse('Simmer gently.', ings)).toEqual([]);
	});
	it('ignores an ingredient word used as a technique', () => {
		const ings = [{ id: 'f', name: '00 flour' }, { id: 'b', name: 'butter' }];
		expect(matchIngredientsInProse('Place the dough on a lightly floured surface and flour your hands.', ings)).toEqual([]);
		expect(matchIngredientsInProse('Lightly flour your pizza peel.', ings)).toEqual([]);
		// still links when it is genuinely an ingredient of the step
		expect(matchIngredientsInProse('Whisk the flour into the melted butter.', ings).sort()).toEqual(['b', 'f']);
		expect(matchIngredientsInProse('Melt the butter in a pan.', ings)).toEqual(['b']);
	});
});

describe('displayAmount', () => {
	it('honours preferAlt', () => {
		expect(displayAmount({ quantity: '1', unit: 'lb', quantity2: '450', unit2: 'g', preferAlt: false })).toEqual({
			main: '1 lb',
			alt: '450 g'
		});
		expect(displayAmount({ quantity: '1', unit: 'lb', quantity2: '450', unit2: 'g', preferAlt: true })).toEqual({
			main: '450 g',
			alt: '1 lb'
		});
	});
});
