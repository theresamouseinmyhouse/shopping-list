import { describe, it, expect } from 'vitest';
import {
	parseIngredient,
	parseIngredientText,
	parseIngredientsBlock,
	parseMethod,
	parsePlainRecipe,
	serializeIngredients,
	serializeMethod,
	serializeRecipe,
	tokenizeStepBody
} from './recipe-parse';
import { coerceRecipeInput } from './recipe';

describe('parseIngredient', () => {
	it('splits quantity / unit / name / comment', () => {
		expect(parseIngredient('1 1/2 cups all-purpose flour, sifted')).toEqual({
			quantity: '1 1/2',
			unit: 'cup',
			name: 'all-purpose flour',
			comment: 'sifted'
		});
		expect(parseIngredient('2 cloves garlic (minced)')).toEqual({
			quantity: '2',
			unit: 'clove',
			name: 'garlic',
			comment: 'minced'
		});
		expect(parseIngredient('3 large eggs, beaten')).toEqual({
			quantity: '3',
			unit: '',
			name: 'large eggs',
			comment: 'beaten'
		});
	});
	it('keeps a real comma list in the name', () => {
		expect(parseIngredient('salt, pepper and cumin').name).toBe('salt, pepper and cumin');
	});
	it('handles quantity modifiers and "plus" compounds', () => {
		expect(parseIngredient('1 heaping teaspoon active dry yeast')).toMatchObject({
			quantity: '1',
			unit: 'tsp',
			name: 'active dry yeast'
		});
		expect(parseIngredient('1 1/2 cups plus 1 tablespoon lukewarm water')).toMatchObject({
			quantity: '1 1/2',
			unit: 'cup',
			name: 'lukewarm water',
			comment: 'plus 1 tablespoon'
		});
	});
	it('pulls ", or <alternative>" into the comment', () => {
		expect(parseIngredient('1 tsp active dry yeast, or 1 tsp instant yeast')).toMatchObject({
			quantity: '1',
			unit: 'tsp',
			name: 'active dry yeast',
			comment: 'or 1 tsp instant yeast'
		});
	});
});

describe('parseIngredientText (| dual measures)', () => {
	it('collapses a same-measure metric|imperial pair to the metric one', () => {
		expect(parseIngredientText("500 g | 17.6 oz '00' flour")).toMatchObject({
			quantity: '500',
			unit: 'g',
			quantity2: '',
			unit2: '',
			name: "'00' flour"
		});
		expect(parseIngredientText('300 ml | 10 fl oz water')).toMatchObject({
			quantity: '300',
			unit: 'ml',
			quantity2: ''
		});
	});
	it('keeps a genuine volume + weight pair', () => {
		expect(parseIngredientText('1 1/2 cups | 190 g flour')).toMatchObject({
			quantity: '1 1/2',
			unit: 'cup',
			quantity2: '190',
			unit2: 'g',
			name: 'flour'
		});
	});
});

describe('parseIngredientsBlock', () => {
	it('handles groups and sub-recipe includes', () => {
		const { ingredients, includes } = parseIngredientsBlock(
			['## For the filling', '2 lb beef', '1 onion', '+ Gravy', '## For the top', '3 cups mashed potato'].join('\n')
		);
		expect(ingredients.map((i) => [i.group, i.name])).toEqual([
			['For the filling', 'beef'],
			['For the filling', 'onion'],
			['For the top', 'mashed potato']
		]);
		expect(includes).toEqual(['Gravy']);
	});
});

describe('parseMethod', () => {
	it('one step per paragraph, ## groups, + includes attach to the last step', () => {
		const { steps, leadingIncludes } = parseMethod(
			['Brown the beef with the onion.', '', '## Assembly', '', 'Spread the potato on top.', '+ Gravy'].join('\n')
		);
		expect(leadingIncludes).toEqual([]);
		expect(steps.map((s) => [s.group, s.body])).toEqual([
			['', 'Brown the beef with the onion.'],
			['Assembly', 'Spread the potato on top.']
		]);
		expect(steps[1].includes).toEqual(['Gravy']);
	});
	it('splits a numbered list into steps', () => {
		const { steps } = parseMethod('1. Preheat oven.\n2. Mix everything.\n3. Bake 20 min.');
		expect(steps.map((s) => s.body)).toEqual(['Preheat oven.', 'Mix everything.', 'Bake 20 min.']);
	});
});

describe('parsePlainRecipe', () => {
	it('reads a heading-delimited recipe', () => {
		const r = parsePlainRecipe(
			[
				'Grandma Pie',
				'Serves: 6',
				'',
				'Ingredients',
				'2 lb beef',
				'1 tsp salt',
				'',
				'Method',
				'Brown the beef.',
				'',
				'Season with salt and bake.'
			].join('\n')
		);
		expect(r.title).toBe('Grandma Pie');
		expect(r.servings).toBe('6');
		expect(r.ingredients.map((i) => i.name)).toEqual(['beef', 'salt']);
		expect(r.steps).toHaveLength(2);
	});
	it('falls back to a leading ingredient run when there are no headings', () => {
		const r = parsePlainRecipe('2 cups flour\n1 tsp salt\n\nMix and knead the dough. Bake at 400.');
		expect(r.ingredients.map((i) => i.name)).toEqual(['flour', 'salt']);
		expect(r.steps.length).toBeGreaterThanOrEqual(1);
	});
});

describe('serialize round-trips', () => {
	it('ingredients survive serialize -> parse', () => {
		const src = '## For the sauce\n1 1/2 cups | 190 g flour (sifted)\n2 clove garlic\n\n1 tsp salt';
		const { ingredients } = parseIngredientsBlock(src);
		const again = parseIngredientsBlock(serializeIngredients(ingredients));
		expect(again.ingredients.map((i) => [i.group, i.quantity, i.unit, i.name, i.comment])).toEqual(
			ingredients.map((i) => [i.group, i.quantity, i.unit, i.name, i.comment])
		);
	});
	it('method survives serialize -> parse', () => {
		const { steps } = parseMethod('Do the first thing.\n\n## Part two\n\nDo the second thing.\n+ Gravy');
		const again = parseMethod(serializeMethod(steps));
		expect(again.steps.map((s) => [s.group, s.body, s.includes])).toEqual(
			steps.map((s) => [s.group, s.body, s.includes])
		);
	});
	it('whole recipe survives serializeRecipe -> parsePlainRecipe', () => {
		const r = coerceRecipeInput(
			parsePlainRecipe(
				[
					'Title: Roux',
					'Serves: 4',
					'@ingredients',
					'2 tbsp butter',
					'1 1/2 cups | 190 g flour',
					'@method',
					'Melt the butter.',
					'',
					'Whisk in the flour until smooth.'
				].join('\n')
			)
		);
		const back = coerceRecipeInput(parsePlainRecipe(serializeRecipe(r)));
		expect(back.title).toBe('Roux');
		expect(back.servings).toBe('4');
		expect(back.ingredients.map((i) => [i.quantity, i.unit, i.quantity2, i.unit2, i.name])).toEqual(
			r.ingredients.map((i) => [i.quantity, i.unit, i.quantity2, i.unit2, i.name])
		);
		expect(back.steps.map((s) => s.body)).toEqual(r.steps.map((s) => s.body));
	});
});

describe('tokenizeStepBody', () => {
	it('splits plain text with no tokens into one text segment', () => {
		expect(tokenizeStepBody('Preheat the oven.')).toEqual([
			{ type: 'text', text: 'Preheat the oven.' }
		]);
	});

	it('parses a braced ingredient token with quantity and unit', () => {
		const segs = tokenizeStepBody('Fry @pancetta{200%g} until crispy.');
		expect(segs).toEqual([
			{ type: 'text', text: 'Fry ' },
			{ type: 'ingredient', name: 'pancetta', quantity: '200', unit: 'g', quantity2: '', unit2: '' },
			{ type: 'text', text: ' until crispy.' }
		]);
	});

	it('parses a bare single-word ingredient token with no braces', () => {
		const segs = tokenizeStepBody('Season with @salt.');
		expect(segs).toEqual([
			{ type: 'text', text: 'Season with ' },
			{ type: 'ingredient', name: 'salt', quantity: '', unit: '', quantity2: '', unit2: '' },
			{ type: 'text', text: '.' }
		]);
	});

	it('parses a multi-word braced ingredient name', () => {
		const segs = tokenizeStepBody('Add @ground beef{1%lb}.');
		expect(segs[1]).toEqual({
			type: 'ingredient', name: 'ground beef', quantity: '1', unit: 'lb', quantity2: '', unit2: ''
		});
	});

	it('parses a dual-measure ingredient token', () => {
		const segs = tokenizeStepBody('Whisk in @flour{1.5%cups|190%g}.');
		expect(segs[1]).toEqual({
			type: 'ingredient', name: 'flour', quantity: '1.5', unit: 'cups', quantity2: '190', unit2: 'g'
		});
	});

	it('parses an anonymous timer', () => {
		const segs = tokenizeStepBody('Add garlic for ~{30%seconds}.');
		expect(segs[1]).toEqual({ type: 'timer', label: '', quantity: '30', unit: 'seconds' });
	});

	it('parses a named timer', () => {
		const segs = tokenizeStepBody('Let it ~simmer{45%minutes} on low.');
		expect(segs[1]).toEqual({ type: 'timer', label: 'simmer', quantity: '45', unit: 'minutes' });
	});

	it('recognizes a trailing comment at the end of the step only', () => {
		const segs = tokenizeStepBody('Simmer beans until tender. -- canned beans work too');
		expect(segs).toEqual([
			{ type: 'text', text: 'Simmer beans until tender.' },
			{ type: 'comment', text: 'canned beans work too' }
		]);
	});

	it('does not treat a mid-sentence " -- " as a comment when more text follows', () => {
		// "-- " only counts as a comment when it is the LAST such marker in the body
		const segs = tokenizeStepBody('Do this -- carefully -- then that.');
		expect(segs.filter((s) => s.type === 'comment')).toEqual([{ type: 'comment', text: 'then that.' }]);
	});

	it('handles a step with an ingredient, a timer, and a trailing comment together', () => {
		const segs = tokenizeStepBody(
			'Fry @pancetta{200%g} until crispy, then add @garlic{2%cloves} for ~{30%seconds}. -- watch it, garlic burns fast'
		);
		expect(segs.map((s) => s.type)).toEqual([
			'text', 'ingredient', 'text', 'ingredient', 'text', 'timer', 'text', 'comment'
		]);
		expect(segs[segs.length - 1]).toEqual({ type: 'comment', text: 'watch it, garlic burns fast' });
	});

	it('ignores an empty-braced ingredient token (no quantity)', () => {
		const segs = tokenizeStepBody('Season the @chicken breast{}.');
		expect(segs[1]).toEqual({
			type: 'ingredient', name: 'chicken breast', quantity: '', unit: '', quantity2: '', unit2: ''
		});
	});
});
