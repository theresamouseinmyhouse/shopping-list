import { describe, it, expect } from 'vitest';
import { parseAdd, singularizeName, nameVariants } from './quantity';

describe('parseAdd', () => {
	it('pulls a leading digit', () => {
		expect(parseAdd('4 milk')).toEqual({ qty: 4, name: 'milk' });
		expect(parseAdd('12 eggs')).toEqual({ qty: 12, name: 'eggs' });
		expect(parseAdd('2x soda')).toEqual({ qty: 2, name: 'soda' });
	});
	it('pulls a leading number word', () => {
		expect(parseAdd('two onions')).toEqual({ qty: 2, name: 'onions' });
		expect(parseAdd('a dozen rolls')).toEqual({ qty: 1, name: 'dozen rolls' }); // "a" wins first
		expect(parseAdd('dozen rolls')).toEqual({ qty: 12, name: 'rolls' });
	});
	it('pulls a trailing xN', () => {
		expect(parseAdd('paper towels x3')).toEqual({ qty: 3, name: 'paper towels' });
	});
	it('leaves a plain name alone', () => {
		expect(parseAdd('chicken breast')).toEqual({ qty: null, name: 'chicken breast' });
		expect(parseAdd('7up')).toEqual({ qty: null, name: '7up' });
	});
	it('handles up to 3-digit counts', () => {
		expect(parseAdd('24 waters').qty).toBe(24);
		expect(parseAdd('9999 rice')).toEqual({ qty: null, name: '9999 rice' });
	});
});

describe('singularizeName', () => {
	it('singularises the last word', () => {
		expect(singularizeName('onions')).toBe('onion');
		expect(singularizeName('milks')).toBe('milk');
		expect(singularizeName('berries')).toBe('berry');
		expect(singularizeName('chicken breasts')).toBe('chicken breast');
		expect(singularizeName('boxes')).toBe('box');
	});
	it('leaves short / non-plural words', () => {
		expect(singularizeName('gas')).toBe('gas');
		expect(singularizeName('hummus')).toBe('hummus');
		expect(singularizeName('milk')).toBe('milk');
	});
});

describe('nameVariants', () => {
	it('includes singular and plural forms', () => {
		expect(nameVariants('milks')).toEqual(expect.arrayContaining(['milks', 'milk']));
		expect(nameVariants('milk')).toEqual(expect.arrayContaining(['milk', 'milks']));
		expect(nameVariants('berry')).toEqual(expect.arrayContaining(['berry', 'berries']));
	});
});
