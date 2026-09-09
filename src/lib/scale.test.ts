import { describe, it, expect } from 'vitest';
import { parseQuantity, formatQuantity, scaleQuantity, factorFromHave } from './scale';

describe('parseQuantity', () => {
	it('parses whole, fraction, mixed, unicode', () => {
		expect(parseQuantity('2')).toEqual({ lo: 2, hi: 2 });
		expect(parseQuantity('1/2')).toEqual({ lo: 0.5, hi: 0.5 });
		expect(parseQuantity('1 1/2')).toEqual({ lo: 1.5, hi: 1.5 });
		expect(parseQuantity('½')).toEqual({ lo: 0.5, hi: 0.5 });
		expect(parseQuantity('1½')).toEqual({ lo: 1.5, hi: 1.5 });
	});
	it('parses a range', () => {
		expect(parseQuantity('2-3')).toEqual({ lo: 2, hi: 3 });
		expect(parseQuantity('2–3')).toEqual({ lo: 2, hi: 3 });
	});
	it('returns null for non-numeric', () => {
		expect(parseQuantity('')).toBeNull();
		expect(parseQuantity('a pinch')).toBeNull();
		expect(parseQuantity('to taste')).toBeNull();
	});
});

describe('formatQuantity', () => {
	it('snaps to friendly fractions', () => {
		expect(formatQuantity(2)).toBe('2');
		expect(formatQuantity(1.5)).toBe('1½');
		expect(formatQuantity(0.625)).toBe('⅝');
		expect(formatQuantity(0.75)).toBe('¾');
		expect(formatQuantity(1.875)).toBe('1⅞');
		expect(formatQuantity(0.13)).toBe('⅛');
	});
});

describe('scaleQuantity', () => {
	it('scales and reformats', () => {
		expect(scaleQuantity('8', 0.625)).toBe('5');
		expect(scaleQuantity('1', 0.625)).toBe('⅝');
		expect(scaleQuantity('1 1/2', 2)).toBe('3');
		expect(scaleQuantity('3', 0.5)).toBe('1½');
		expect(scaleQuantity('2-3', 2)).toBe('4-6');
	});
	it('leaves unparseable amounts alone', () => {
		expect(scaleQuantity('', 2)).toBe('');
		expect(scaleQuantity('a pinch', 2)).toBe('a pinch');
	});
	it('factor 1 is a no-op', () => {
		expect(scaleQuantity('1 1/2', 1)).toBe('1 1/2');
	});
});

describe('factorFromHave', () => {
	it('computes a non-even factor', () => {
		expect(factorFromHave('8', 5)).toBeCloseTo(0.625);
		expect(factorFromHave('2', 3)).toBeCloseTo(1.5);
		expect(factorFromHave('2-4', 3)).toBeCloseTo(1); // uses the midpoint (3)
	});
	it('null when the recipe amount is unparseable', () => {
		expect(factorFromHave('a handful', 2)).toBeNull();
	});
});
