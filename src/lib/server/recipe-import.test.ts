import { describe, it, expect } from 'vitest';
import {
	parseJsonLdRecipe,
	parseMicrodataRecipe,
	isPrivateAddress,
	stripHtml,
	importFromUrl,
	importFromText,
	ImportError
} from './recipe-import';

const wrap = (ld: object) =>
	`<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>x</body></html>`;

describe('parseJsonLdRecipe', () => {
	it('builds one ingredient list and links steps by prose', () => {
		const r = parseJsonLdRecipe(
			wrap({
				'@graph': [
					{ '@type': 'WebPage', name: 'ignore' },
					{
						'@type': 'Recipe',
						name: 'Pan Gravy',
						recipeYield: ['2 cups', '4 servings'],
						recipeIngredient: ['2 tbsp butter', '2 tbsp flour', '1 cup chicken stock'],
						recipeInstructions: [
							{ '@type': 'HowToStep', text: 'Melt the butter in a pan.' },
							{ '@type': 'HowToStep', text: 'Whisk in the flour, then the stock.' }
						]
					}
				]
			})
		)!;
		expect(r.title).toBe('Pan Gravy');
		expect(r.servings).toBe('2 cups');
		expect(r.ingredients.map((i) => [i.quantity, i.unit, i.name])).toEqual([
			['2', 'tbsp', 'butter'],
			['2', 'tbsp', 'flour'],
			['1', 'cup', 'chicken stock']
		]);
		const byName = Object.fromEntries(r.ingredients.map((i) => [i.name, i.id]));
		expect(r.steps[0].ingredientIds).toEqual([byName.butter]);
		expect(r.steps[1].ingredientIds.sort()).toEqual([byName.flour, byName['chicken stock']].sort());
	});

	it('maps HowToSection names to group labels', () => {
		const r = parseJsonLdRecipe(
			wrap({
				'@type': 'Recipe',
				name: 'Two Part',
				recipeIngredient: ['1 tsp salt'],
				recipeInstructions: [
					{
						'@type': 'HowToSection',
						name: 'Prep',
						itemListElement: [
							{ '@type': 'HowToStep', text: 'Chop everything.' },
							{ '@type': 'HowToStep', text: 'Measure the salt.' }
						]
					}
				]
			})
		)!;
		expect(r.steps.map((s) => [s.group, s.body])).toEqual([
			['Prep', 'Chop everything.'],
			['Prep', 'Measure the salt.']
		]);
	});

	it('returns null without a Recipe node', () => {
		expect(parseJsonLdRecipe(wrap({ '@type': 'Article', name: 'x' }))).toBeNull();
	});
});

describe('parseMicrodataRecipe', () => {
	it('reads itemprop ingredients + instructions', () => {
		const html = `
			<div itemscope itemtype="http://schema.org/Recipe">
				<h1 itemprop="name">Simple Toast</h1>
				<span itemprop="recipeYield">1</span>
				<li itemprop="recipeIngredient">2 slices bread</li>
				<li itemprop="recipeIngredient">1 tbsp butter</li>
				<div itemprop="recipeInstructions">Toast the bread. Spread the butter.</div>
			</div>`;
		const r = parseMicrodataRecipe(html)!;
		expect(r.title).toBe('Simple Toast');
		expect(r.ingredients.map((i) => i.name)).toEqual(['bread', 'butter']);
		expect(r.steps.length).toBeGreaterThanOrEqual(2);
	});
	it('returns null with too few ingredients', () => {
		expect(parseMicrodataRecipe('<div itemprop="recipeIngredient">salt</div>')).toBeNull();
	});
});

describe('importFromText', () => {
	it('parses a pasted recipe with no AI', () => {
		const r = importFromText('Ingredients\n2 cups flour\n1 tsp salt\n\nMethod\nMix and bake.');
		expect(r.method).toBe('text');
		expect(r.draft.ingredients.map((i) => i.name)).toEqual(['flour', 'salt']);
		expect(r.thin).toBe(false);
	});
});

describe('importFromUrl SSRF guard', () => {
	it('rejects private hosts and non-http schemes', async () => {
		await expect(importFromUrl('http://10.0.0.1/recipe')).rejects.toBeInstanceOf(ImportError);
		await expect(importFromUrl('file:///etc/passwd')).rejects.toBeInstanceOf(ImportError);
	});
});

describe('isPrivateAddress / stripHtml', () => {
	it('flags private ranges', () => {
		for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '169.254.1.1', '::1', 'fd00::1'])
			expect(isPrivateAddress(ip)).toBe(true);
		for (const ip of ['8.8.8.8', '1.1.1.1']) expect(isPrivateAddress(ip)).toBe(false);
	});
	it('strips tags/scripts/styles', () => {
		expect(stripHtml('<style>a{}</style><p>Hi <b>there</b></p><script>x()</script>')).toBe('Hi there');
	});
});
