// Deterministic recipe parsing — no AI. Turns pasted text / stripped web pages
// into a RecipeInput. Handles:
//   - explicit markers:  @ingredients / @method   (what the AI is asked to emit)
//   - plain headings:     "Ingredients" / "Method" / "Directions" / ...
//   - no headings:        a leading run of ingredient-like lines, then prose steps
// `##` (or `#`) lines are group headers ("For the sauce").

import {
	blankIngredient,
	blankStep,
	emptyRecipeInput,
	type RecipeIngredient,
	type RecipeInput
} from './recipe';
import { canonicalizeUnit, isMetricUnit, parseIngredientLine, sameMeasureKind } from './units';

const PREP_WORDS = new Set([
	'diced', 'chopped', 'minced', 'sliced', 'grated', 'shredded', 'crushed', 'ground',
	'softened', 'melted', 'sifted', 'packed', 'divided', 'drained', 'rinsed', 'cubed',
	'julienned', 'halved', 'quartered', 'peeled', 'seeded', 'cored', 'trimmed', 'beaten',
	'whisked', 'cooked', 'toasted', 'roasted', 'chilled', 'warmed', 'room-temperature',
	'optional', 'divided', 'plus', 'zested', 'juiced', 'crumbled'
]);

/** "1 1/2 cups (packed) light brown sugar, sifted" -> {quantity,unit,name,comment} */
export function parseIngredient(raw: string): { quantity: string; unit: string; name: string; comment: string } {
	let line = raw.trim().replace(/\s+/g, ' ');
	const comments: string[] = [];

	// parenthetical notes anywhere
	line = line.replace(/\(([^)]*)\)/g, (_, inner: string) => {
		const t = inner.trim();
		if (t) comments.push(t);
		return ' ';
	});
	line = line.replace(/\s+/g, ' ').trim();

	const A = '0-9¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞./\\-';

	// drop a quantity modifier adjective ("1 heaping teaspoon" -> "1 teaspoon")
	line = line.replace(
		new RegExp(
			`^(\\s*[${A}][${A}\\s]*?)\\s+(?:heaping|heaped|scant|rounded|level|generous|good|big|small|slightly rounded)\\s+`,
			'i'
		),
		'$1 '
	);

	// "1 1/2 cups plus 1 tablespoon" -> keep the first amount, note the rest
	const plusM = line.match(new RegExp(`\\s+(?:plus|and)\\s+[${A}][${A}\\s]*\\s*[a-z]+`, 'i'));
	if (plusM && plusM.index !== undefined && new RegExp(`^[${A}]`).test(line)) {
		comments.push(plusM[0].trim());
		line = (line.slice(0, plusM.index) + line.slice(plusM.index + plusM[0].length)).replace(/\s+/g, ' ').trim();
	}

	// ", or <alternative>" — a substitution, not part of the name
	const orAt = line.search(/,\s*or\s+\S/i);
	if (orAt > 0) {
		comments.push(line.slice(orAt).replace(/^,\s*/, '').trim());
		line = line.slice(0, orAt).trim();
	}

	// trailing ", <prep>" — only when it reads like prep, not "salt, pepper, cumin"
	const comma = line.lastIndexOf(',');
	if (comma > 0) {
		const tail = line.slice(comma + 1).trim();
		const words = tail.toLowerCase().replace(/\.$/, '').split(/\s+|\//);
		const prepish =
			words.length <= 4 &&
			(words.some((w) => PREP_WORDS.has(w) || w.endsWith('ed')) ||
				/^to taste$|^as needed$|^for (serving|garnish|dusting)$/i.test(tail));
		if (prepish) {
			comments.unshift(tail);
			line = line.slice(0, comma).trim();
		}
	}

	const { quantity, unit, name } = parseIngredientLine(line);
	return {
		quantity,
		unit: canonicalizeUnit(unit),
		name: name.replace(/\s+/g, ' ').trim(),
		comment: comments.join('; ')
	};
}

function groupHeader(line: string): string | null {
	const m = line.match(/^#{1,3}\s*(.+?)\s*:?\s*$/);
	if (m) return m[1].trim();
	// "For the sauce:" / "SAUCE:" style with no hash
	const m2 = line.match(/^(?:for the .+|[A-Z][A-Z \-']{2,}):?\s*$/);
	if (m2) return line.replace(/:\s*$/, '').trim();
	return null;
}

const ING_HEADING = /^\s*@?ingredients?\s*:?\s*$/i;
const METHOD_HEADING = /^\s*@?(?:method|directions?|instructions?|steps?|preparation)\s*:?\s*$/i;
const TITLE_LINE = /^\s*title\s*:\s*(.+)$/i;
const YIELD_LINE = /^\s*(?:serves|servings|yield|makes)\s*:?\s*(.+)$/i;

/** Does a line look like an ingredient rather than a sentence? */
function ingredientLike(line: string): boolean {
	const t = line.trim();
	if (!t || /[.!?]$/.test(t) || /^\d+[.)]\s/.test(t)) return false;
	const p = parseIngredient(t);
	if (p.quantity) return true;
	const words = t.split(/\s+/).length;
	return words > 0 && words <= 5 && !/^(then|next|meanwhile|add|stir|mix|heat|cook|bake|pour|remove|serve|combine|whisk|preheat)\b/i.test(t);
}

export function parseIngredientsBlock(text: string): {
	ingredients: RecipeIngredient[];
	includes: string[];
} {
	const ingredients: RecipeIngredient[] = [];
	const includes: string[] = [];
	let group = '';
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const gh = groupHeader(line);
		if (gh !== null) {
			group = gh;
			continue;
		}
		if (/^\+\s*/.test(line)) {
			includes.push(line.replace(/^\+\s*/, '').trim());
			continue;
		}
		const p = parseIngredientText(line.replace(/^[-*•]\s*/, ''));
		if (!p.name) continue;
		p.group = group;
		ingredients.push(p);
	}
	return { ingredients, includes };
}

/** The workhorse. Also the AI-output parser (the AI emits @ingredients / @method). */
export function parsePlainRecipe(text: string): RecipeInput {
	const out = emptyRecipeInput();
	const lines = text.replace(/\r\n/g, '\n').split('\n');

	// 1. header lines (title / yield) from the top
	let i = 0;
	for (; i < lines.length; i++) {
		const l = lines[i].trim();
		if (!l) continue;
		const t = l.match(TITLE_LINE);
		if (t) {
			out.title = t[1].trim();
			continue;
		}
		const y = l.match(YIELD_LINE);
		if (y) {
			out.servings = y[1].trim();
			continue;
		}
		break;
	}

	// 2. locate ingredient / method blocks by heading + any stray title/yield lines
	let ingStart = -1;
	let methodStart = -1;
	for (let j = 0; j < lines.length; j++) {
		if (ingStart < 0 && ING_HEADING.test(lines[j])) ingStart = j + 1;
		else if (methodStart < 0 && METHOD_HEADING.test(lines[j])) methodStart = j + 1;
		const stop = Math.min(...[ingStart, methodStart].filter((x) => x >= 0), Infinity);
		if (j < stop) {
			const tl = lines[j].match(TITLE_LINE);
			if (tl && !out.title) out.title = tl[1].trim();
			const yl = lines[j].match(YIELD_LINE);
			if (yl && !out.servings) out.servings = yl[1].trim();
		}
	}

	let ingredientText: string;
	let methodText: string;

	if (ingStart >= 0 || methodStart >= 0) {
		const ingEnd = methodStart > ingStart ? methodStart - 1 : lines.length;
		ingredientText = ingStart >= 0 ? lines.slice(ingStart, ingEnd).join('\n') : '';
		methodText = methodStart >= 0 ? lines.slice(methodStart).join('\n') : '';
		if (!out.title) out.title = guessTitle(lines);
	} else {
		// 3. no headings: leading ingredient-like run = ingredients, rest = method
		const body = lines.slice(i);
		if (!out.title && body.length) {
			const first = body[0].trim();
			if (first && !ingredientLike(first) && first.split(/\s+/).length <= 8) {
				out.title = first.replace(/:\s*$/, '');
				body.shift();
			}
		}
		let split = 0;
		let sawIngredient = false;
		for (let k = 0; k < body.length; k++) {
			const l = body[k].trim();
			if (!l) {
				if (sawIngredient) {
					split = k;
					break;
				}
				continue;
			}
			if (groupHeader(l) !== null || ingredientLike(l)) {
				sawIngredient = true;
				split = k + 1;
			} else if (sawIngredient) {
				split = k;
				break;
			}
		}
		ingredientText = body.slice(0, split).join('\n');
		methodText = body.slice(split).join('\n');
	}

	const ingParsed = parseIngredientsBlock(ingredientText);
	out.ingredients = ingParsed.ingredients;
	const method = parseMethod(methodText);
	out.steps = method.steps;
	out.miseEnPlaceIncludes = [...ingParsed.includes, ...method.leadingIncludes];
	return out;
}

function guessTitle(lines: string[]): string {
	for (const l of lines) {
		const t = l.trim();
		if (!t) continue;
		if (ING_HEADING.test(t) || METHOD_HEADING.test(t) || YIELD_LINE.test(t)) return '';
		const tl = t.match(TITLE_LINE);
		if (tl) return tl[1].trim();
		return t.split(/\s+/).length <= 10 && !/[.!?]$/.test(t) ? t.replace(/:\s*$/, '') : '';
	}
	return '';
}

export function parseMethod(text: string): {
	steps: RecipeInput['steps'];
	leadingIncludes: string[];
} {
	const steps: RecipeInput['steps'] = [];
	const leadingIncludes: string[] = [];
	let group = '';

	const addInclude = (title: string) => {
		if (steps.length) steps[steps.length - 1].includes.push(title);
		else leadingIncludes.push(title);
	};
	const emit = (bodyRaw: string) => {
		const body = bodyRaw.replace(/^\s*(?:\d+[.)]|step\s+\d+[:.]?)\s+/i, '').trim();
		if (!body) return;
		if (/^\+\s*/.test(body)) {
			addInclude(body.replace(/^\+\s*/, '').trim());
			return;
		}
		const gh = groupHeader(body);
		if (gh !== null && body.split(/\s+/).length <= 6) {
			group = gh;
			return;
		}
		steps.push({ ...blankStep(), body, group });
	};

	// If paragraphs are separated by blank lines, each paragraph is a step.
	// If there are no blank lines at all, fall back to one step per line.
	const hasBlankSeparators = /\n[ \t]*\n/.test(text.trim());
	const blocks = hasBlankSeparators ? text.split(/\n[ \t]*\n+/) : text.split(/\n/);

	for (const block of blocks) {
		const rawLines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
		if (!rawLines.length) continue;
		const numbered = (l: string) => /^\s*(?:\d+[.)]|step\s+\d+[:.]?)\s+/i.test(l);
		// a paragraph that is itself a numbered/bulleted list -> one step per line
		if (rawLines.length > 1 && rawLines.every((l) => numbered(l) || /^\+\s*/.test(l))) {
			rawLines.forEach(emit);
			continue;
		}
		const bodyLines = rawLines.filter((l) => !/^\+\s*/.test(l));
		const incLines = rawLines.filter((l) => /^\+\s*/.test(l));
		if (bodyLines.length) emit(bodyLines.join(' '));
		for (const l of incLines) addInclude(l.replace(/^\+\s*/, '').trim());
	}
	return { steps, leadingIncludes };
}

/** Back-compat name used by the import module. */
export const parseRecipeText = parsePlainRecipe;

// ---------------------------------------------------------------------------
// Serialize — RecipeInput -> the two textareas the editor shows. Round-trips
// with parseIngredientsBlock / parseMethod.
// ---------------------------------------------------------------------------

export function serializeIngredients(ingredients: RecipeIngredient[], includes: string[] = []): string {
	const out: string[] = [];
	let group = '';
	for (const t of includes) out.push(`+ ${t}`);
	for (const i of ingredients) {
		if (i.group && i.group !== group) {
			if (out.length) out.push('');
			out.push(`## ${i.group}`);
			group = i.group;
		} else if (!i.group && group) {
			out.push('');
			group = '';
		}
		const a = [i.quantity, i.unit].filter(Boolean).join(' ');
		const a2 = [i.quantity2, i.unit2].filter(Boolean).join(' ');
		const amount = a2 ? `${a} | ${a2}` : a;
		const comment = i.comment ? ` (${i.comment})` : '';
		out.push(`${amount ? amount + ' ' : ''}${i.name}${comment}`.trim());
	}
	return out.join('\n');
}

export function serializeMethod(
	steps: { body: string; group: string; includes: string[] }[]
): string {
	const out: string[] = [];
	let group = '';
	for (const s of steps) {
		if (s.group && s.group !== group) {
			if (out.length) out.push('');
			out.push(`## ${s.group}`);
			out.push('');
			group = s.group;
		}
		out.push(s.body.trim());
		for (const inc of s.includes) out.push(`+ ${inc}`);
		out.push('');
	}
	return out.join('\n').trim();
}

/** Whole recipe -> the `Title:/Serves:/@ingredients/@method` document. */
export function serializeRecipe(r: RecipeInput): string {
	const parts = [];
	if (r.title) parts.push(`Title: ${r.title}`);
	if (r.servings) parts.push(`Serves: ${r.servings}`);
	parts.push('', '@ingredients', serializeIngredients(r.ingredients, r.miseEnPlaceIncludes));
	parts.push('', '@method', serializeMethod(r.steps));
	return parts.join('\n').trim();
}

/** One ingredient line, possibly "qty unit | qty2 unit2  name" (AI dual measure). */
export function parseIngredientText(line: string): RecipeIngredient {
	const parts = line.split('|');
	const first = parseIngredient(parts[0].trim());
	const ing = { ...blankIngredient(), ...first };
	if (parts.length > 1) {
		const second = parseIngredient(parts[1].trim());
		if (!ing.name && second.name) ing.name = second.name;
		if (second.comment && !ing.comment) ing.comment = second.comment;

		if (sameMeasureKind(ing.unit, second.unit)) {
			// same measure written two ways ("500 g | 17.6 oz") — keep the metric one
			if (!isMetricUnit(ing.unit) && isMetricUnit(second.unit)) {
				ing.quantity = second.quantity;
				ing.unit = second.unit;
			}
		} else if (second.quantity || second.unit) {
			// genuine weight-AND-volume pairing — keep both
			ing.quantity2 = second.quantity;
			ing.unit2 = canonicalizeUnit(second.unit);
		}
	}
	return ing;
}
