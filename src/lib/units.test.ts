import { describe, it, expect } from 'vitest';
import {
	canonicalizeUnit,
	parseIngredientLine,
	formatAmount,
	unitSystem,
	sameMeasureKind,
	isMetricUnit
} from './units';

describe('canonicalizeUnit', () => {
	it('collapses aliases to one spelling', () => {
		for (const a of ['tsp', 'tsp.', 't', 'teaspoon', 'Teaspoons', ' TS ']) {
			expect(canonicalizeUnit(a)).toBe('tsp');
		}
		expect(canonicalizeUnit('Tablespoon')).toBe('tbsp');
		expect(canonicalizeUnit('grams')).toBe('g');
		expect(canonicalizeUnit('lbs')).toBe('lb');
	});
	it('keeps an unknown unit, cleaned', () => {
		expect(canonicalizeUnit('knob')).toBe('knob');
		expect(canonicalizeUnit('Splash.')).toBe('splash');
	});
});

describe('parseIngredientLine', () => {
	it('splits quantity / unit / name', () => {
		expect(parseIngredientLine('1 1/2 cups all-purpose flour')).toEqual({
			quantity: '1 1/2',
			unit: 'cup',
			name: 'all-purpose flour'
		});
		expect(parseIngredientLine('2 lb ground lamb')).toEqual({ quantity: '2', unit: 'lb', name: 'ground lamb' });
		expect(parseIngredientLine('3 large eggs')).toEqual({ quantity: '3', unit: '', name: 'large eggs' });
		expect(parseIngredientLine('1 tsp. salt')).toEqual({ quantity: '1', unit: 'tsp', name: 'salt' });
		expect(parseIngredientLine('8 fl oz milk')).toEqual({ quantity: '8', unit: 'fl oz', name: 'milk' });
	});
	it('normalises unicode fractions and dashes', () => {
		expect(parseIngredientLine('½ cup sugar')).toEqual({ quantity: '1/2', unit: 'cup', name: 'sugar' });
		expect(parseIngredientLine('1½ cups sugar')).toMatchObject({ quantity: '1 1/2', unit: 'cup' });
		expect(parseIngredientLine('2–3 tbsp oil')).toMatchObject({ quantity: '2-3', unit: 'tbsp' });
	});
	it('leaves an amountless line as just a name', () => {
		expect(parseIngredientLine('salt and pepper')).toEqual({ quantity: '', unit: '', name: 'salt and pepper' });
	});
	it('drops a leading "of" after the unit', () => {
		expect(parseIngredientLine('2 cloves of garlic')).toEqual({ quantity: '2', unit: 'clove', name: 'garlic' });
	});
});

describe('formatAmount / unitSystem', () => {
	it('formats', () => {
		expect(formatAmount('1 1/2', 'cup')).toBe('1 1/2 cup');
		expect(formatAmount('3', '')).toBe('3');
		expect(formatAmount('', 'pinch')).toBe('pinch');
	});
	it('classifies', () => {
		expect(unitSystem('cup')).toBe('volume');
		expect(unitSystem('lb')).toBe('weight');
		expect(unitSystem('clove')).toBe('count');
		expect(unitSystem('knob')).toBeNull();
	});
});

describe('sameMeasureKind / isMetricUnit', () => {
	it('true for two weights or two volumes, false across systems', () => {
		expect(sameMeasureKind('g', 'oz')).toBe(true);
		expect(sameMeasureKind('ml', 'fl oz')).toBe(true);
		expect(sameMeasureKind('cup', 'g')).toBe(false); // volume vs weight = real dual measure
		expect(sameMeasureKind('clove', 'clove')).toBe(false); // count is not a convertible measure
		expect(sameMeasureKind('g', 'knob')).toBe(false);
	});
	it('flags SI units', () => {
		expect(isMetricUnit('g')).toBe(true);
		expect(isMetricUnit('ml')).toBe(true);
		expect(isMetricUnit('oz')).toBe(false);
		expect(isMetricUnit('cup')).toBe(false);
	});
});
