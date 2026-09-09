// Cooking unit vocabulary. Import and hand-entry both run unit text through
// `canonicalizeUnit` so "tsp" / "teaspoon" / "t." all land on one spelling.

export type UnitSystem = 'volume' | 'weight' | 'count' | 'other';

export interface UnitDef {
	canon: string; // canonical short form, singular
	label: string; // how the editor lists it
	system: UnitSystem;
	metric?: boolean; // true for SI units (g, kg, ml, l…) — used to pick a winner when a
	//                    line gives the same measure two ways ("500 g | 17.6 oz")
	aliases: string[];
}

export const UNITS: UnitDef[] = [
	{ canon: 'tsp', label: 'tsp (teaspoon)', system: 'volume', aliases: ['t', 'ts', 'tsp', 'tsps', 'teaspoon', 'teaspoons'] },
	{ canon: 'tbsp', label: 'tbsp (tablespoon)', system: 'volume', aliases: ['tb', 'tbs', 'tbsp', 'tbsps', 'tbl', 'tblsp', 'tablespoon', 'tablespoons'] },
	{ canon: 'cup', label: 'cup', system: 'volume', aliases: ['c', 'cup', 'cups'] },
	{ canon: 'fl oz', label: 'fl oz (fluid ounce)', system: 'volume', aliases: ['floz', 'fl oz', 'fluid ounce', 'fluid ounces'] },
	{ canon: 'pint', label: 'pint', system: 'volume', aliases: ['pt', 'pint', 'pints'] },
	{ canon: 'quart', label: 'quart', system: 'volume', aliases: ['qt', 'quart', 'quarts'] },
	{ canon: 'gallon', label: 'gallon', system: 'volume', aliases: ['gal', 'gallon', 'gallons'] },
	{ canon: 'ml', label: 'ml (millilitre)', system: 'volume', metric: true, aliases: ['ml', 'mls', 'milliliter', 'milliliters', 'millilitre', 'millilitres'] },
	{ canon: 'l', label: 'l (litre)', system: 'volume', metric: true, aliases: ['l', 'lt', 'ltr', 'liter', 'liters', 'litre', 'litres'] },
	{ canon: 'cl', label: 'cl (centilitre)', system: 'volume', metric: true, aliases: ['cl', 'centiliter', 'centilitre', 'centiliters', 'centilitres'] },
	{ canon: 'g', label: 'g (gram)', system: 'weight', metric: true, aliases: ['g', 'gr', 'gram', 'grams', 'gramme', 'grammes'] },
	{ canon: 'kg', label: 'kg (kilogram)', system: 'weight', metric: true, aliases: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'] },
	{ canon: 'mg', label: 'mg (milligram)', system: 'weight', metric: true, aliases: ['mg', 'milligram', 'milligrams'] },
	{ canon: 'oz', label: 'oz (ounce)', system: 'weight', aliases: ['oz', 'ozs', 'ounce', 'ounces'] },
	{ canon: 'lb', label: 'lb (pound)', system: 'weight', aliases: ['lb', 'lbs', 'pound', 'pounds'] },
	{ canon: 'pinch', label: 'pinch', system: 'other', aliases: ['pinch', 'pinches'] },
	{ canon: 'dash', label: 'dash', system: 'other', aliases: ['dash', 'dashes'] },
	{ canon: 'drop', label: 'drop', system: 'other', aliases: ['drop', 'drops'] },
	{ canon: 'clove', label: 'clove', system: 'count', aliases: ['clove', 'cloves'] },
	{ canon: 'can', label: 'can', system: 'count', aliases: ['can', 'cans'] },
	{ canon: 'jar', label: 'jar', system: 'count', aliases: ['jar', 'jars'] },
	{ canon: 'package', label: 'package', system: 'count', aliases: ['pkg', 'pkgs', 'pkt', 'packet', 'packets', 'package', 'packages'] },
	{ canon: 'stick', label: 'stick', system: 'count', aliases: ['stick', 'sticks'] },
	{ canon: 'slice', label: 'slice', system: 'count', aliases: ['slice', 'slices'] },
	{ canon: 'sprig', label: 'sprig', system: 'count', aliases: ['sprig', 'sprigs'] },
	{ canon: 'bunch', label: 'bunch', system: 'count', aliases: ['bunch', 'bunches'] },
	{ canon: 'head', label: 'head', system: 'count', aliases: ['head', 'heads'] },
	{ canon: 'handful', label: 'handful', system: 'count', aliases: ['handful', 'handfuls'] },
	{ canon: 'piece', label: 'piece', system: 'count', aliases: ['pc', 'pcs', 'piece', 'pieces'] }
];

const BY_ALIAS = new Map<string, UnitDef>();
for (const u of UNITS) {
	BY_ALIAS.set(u.canon.toLowerCase(), u);
	for (const a of u.aliases) BY_ALIAS.set(a.toLowerCase(), u);
}

/** Normalise a unit token. Known units collapse to their canonical form; unknown
 *  tokens come back lightly cleaned (lower-case, no trailing dot) so nothing is lost. */
export function canonicalizeUnit(raw: string): string {
	const cleaned = raw.trim().toLowerCase().replace(/\.+$/, '').replace(/\s+/g, ' ');
	if (!cleaned) return '';
	return BY_ALIAS.get(cleaned)?.canon ?? cleaned;
}

export function unitDef(canon: string): UnitDef | undefined {
	return BY_ALIAS.get(canon.trim().toLowerCase());
}

export function unitSystem(canon: string): UnitSystem | null {
	return unitDef(canon)?.system ?? null;
}

export function isMetricUnit(canon: string): boolean {
	return !!unitDef(canon)?.metric;
}

/**
 * Two amounts that are the *same kind* of measure (both weight, or both volume) —
 * i.e. one is just a unit conversion of the other ("500 g" / "17.6 oz"), not a
 * genuine weight-AND-volume pairing.
 */
export function sameMeasureKind(unitA: string, unitB: string): boolean {
	const a = unitSystem(unitA);
	const b = unitSystem(unitB);
	return !!a && a === b && (a === 'weight' || a === 'volume');
}

const FRAC: Record<string, string> = {
	'¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3',
	'⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6',
	'⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8'
};
const FRAC_CHARS = Object.keys(FRAC).join('');

function normalizeQuantity(q: string): string {
	let s = q.trim().replace(/\s+/g, ' ').replace(/[–—]/g, '-');
	for (const [ch, rep] of Object.entries(FRAC)) {
		s = s.replace(new RegExp(ch, 'g'), (m, off: number) => {
			const prev = s[off - 1];
			return prev && /\d/.test(prev) ? ` ${rep}` : rep;
		});
	}
	return s.replace(/\s*-\s*/g, '-').trim();
}

export interface ParsedIngredient {
	quantity: string;
	unit: string;
	name: string;
}

/** "1 1/2 cups all-purpose flour" -> { quantity: "1 1/2", unit: "cup", name: "all-purpose flour" } */
export function parseIngredientLine(line: string): ParsedIngredient {
	const s = line.trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
	const m = s.match(
		new RegExp(`^([0-9${FRAC_CHARS}](?:[0-9${FRAC_CHARS}.,/\\s-]*[0-9${FRAC_CHARS}/])?)\\s*(.*)$`)
	);
	if (!m || !m[1]) return { quantity: '', unit: '', name: s };

	const quantity = normalizeQuantity(m[1]);
	let rest = m[2].trim();
	if (!rest) return { quantity: '', unit: '', name: s };

	// try to eat a unit off the front — up to two words ("fl oz")
	const words = rest.split(' ');
	for (const take of [2, 1]) {
		if (words.length < take) continue;
		const cand = words.slice(0, take).join(' ').toLowerCase().replace(/\.+$/, '');
		if (BY_ALIAS.has(cand)) {
			return {
				quantity,
				unit: BY_ALIAS.get(cand)!.canon,
				name: words.slice(take).join(' ').replace(/^of\s+/i, '').trim()
			};
		}
	}
	return { quantity, unit: '', name: rest };
}

/** Human-readable amount from the structured fields. */
export function formatAmount(quantity: string, unit: string): string {
	const q = quantity.trim();
	const u = unit.trim();
	if (q && u) return `${q} ${u}`;
	return q || u;
}
