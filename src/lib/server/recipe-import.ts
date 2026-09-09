// Build a RecipeInput draft from a URL, pasted text, or a photo. Everything runs
// through the deterministic parser first (JSON-LD, then microdata, then a
// plain-text heuristic). The Gemini API is only touched when the caller explicitly
// asks for it (the "Try AI" button, or a photo — which can't be parsed otherwise).

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { env } from '$env/dynamic/private';
import { emptyRecipeInput, matchIngredientsInProse, type RecipeInput } from '../recipe';
import { parseIngredientText, parsePlainRecipe, serializeRecipe } from '../recipe-parse';
import { normalizeName } from '../types';

const GEMINI_PROMPT = `You are given a recipe (as text or a photo of a page). Reply with ONLY the recipe in this exact plain-text format, nothing else:

Title: <name>
Serves: <yield, optional>

@ingredients
## For the cake
1 1/2 cups | 190 g  all-purpose flour (sifted)
1 tsp  fine salt
3  large eggs, beaten

@method
## Make the batter
Cream the butter and sugar until pale. Beat in the eggs one at a time.
Fold in the flour and salt.

Bake at 350F for 25 minutes.

Rules:
- List EVERY ingredient once, under @ingredients, quantity first then unit then name ("2 tbsp butter", "1 onion").
- Put prep notes in parentheses or after a comma ("(sifted)", ", beaten") so the name stays plain.
- If the source gives an ingredient two ways (weight AND volume), put both separated by " | ": "1 1/2 cups | 190 g  flour".
- Under @method, write the steps as normal prose, one step per paragraph (blank line between). Name the ingredients in the prose where they are used — do not add a separate list.
- "## " lines are section headers (e.g. "For the sauce"); use them in both blocks when the recipe has parts.
- Standard unit abbreviations: tsp, tbsp, cup, g, kg, oz, lb, ml, l.
- Do not invent quantities, ingredients, or steps not in the source.`;

export class ImportError extends Error {}

export type ImportMethod = 'json-ld' | 'microdata' | 'text' | 'ai';
export interface ImportResult {
	draft: RecipeInput;
	method: ImportMethod;
	/** true when the parser produced little/nothing and AI is worth trying */
	thin: boolean;
}

function isThin(d: RecipeInput): boolean {
	return d.ingredients.length < 2 || d.steps.length === 0;
}

async function fetchHtml(rawUrl: string): Promise<{ url: URL; html: string }> {
	const url = assertPublicHttpUrl(rawUrl);
	await assertNotPrivateHost(url.hostname);
	const res = await fetchWithTimeout(url, 10_000);
	if (!res.ok) throw new ImportError(`The page returned HTTP ${res.status}.`);
	const ct = res.headers.get('content-type') ?? '';
	if (!/text\/html|application\/xhtml/.test(ct)) throw new ImportError('That URL is not an HTML page.');
	return { url, html: await readCapped(res, 2_000_000) };
}

const REFINE_PROMPT = `A recipe has already been roughly parsed. Below is that parse, then the original source. Return a CORRECTED version in the same format — fix only what the parse got wrong:
- merge duplicated ingredients; split any that were run together onto one line
- move prep words ("minced", "sifted", "at room temperature") out of the name, into parentheses
- an ingredient shown the same way twice ("500 g | 17.6 oz", "300 ml | 10 fl oz") should keep ONLY the metric measure; keep genuine "cups | grams" (volume + weight) pairs
- correct a wrong or missing Title / Serves
- make sure every ingredient named in the method also appears under @ingredients
- keep the method wording; only fix its structure (one step per paragraph)
Do not add anything the source does not support.`;

const TIDY_PROMPT = `Tidy this recipe. Return the same format. Only:
- normalise units and quantities; if an ingredient lists the same measure twice ("500 g | 17.6 oz") keep only the metric one
- move prep words out of ingredient names into parentheses
- fix obvious typos and tighten step wording WITHOUT changing meaning or quantities
- ensure every ingredient the steps mention is under @ingredients
Keep all real content — do not drop or invent ingredients or steps.`;

const TIDY_INSTRUCTION_PROMPT = (instruction: string) =>
	`Apply the following change to this recipe, and only this change — leave everything else exactly as it is. Return the same format.

CHANGE REQUESTED: ${instruction}

Notes:
- If the change is a unit conversion, use any equivalent already shown in parentheses (e.g. "(368 grams)"); otherwise convert using standard cooking equivalents.
- Keep every ingredient and step unless the change explicitly requires removing one.`;

// ---------------------------------------------------------------------------
// URL / text import — deterministic parser, never calls AI
// ---------------------------------------------------------------------------

/** Best-effort structured parse of a fetched HTML page. */
export function parseHtmlRecipe(html: string): { draft: RecipeInput; method: ImportMethod } {
	let draft = parseJsonLdRecipe(html);
	let method: ImportMethod = 'json-ld';
	if (!draft || isThin(draft)) {
		const md = parseMicrodataRecipe(html);
		if (md && (!draft || !isThin(md))) {
			draft = md;
			method = 'microdata';
		}
	}
	if (!draft || isThin(draft)) {
		const txt = parsePlainRecipe(stripHtml(html).slice(0, 20_000));
		if (!draft || !isThin(txt)) {
			draft = txt;
			method = 'text';
		}
	}
	return { draft: draft ?? emptyRecipeInput(), method };
}

export async function importFromUrl(rawUrl: string): Promise<ImportResult> {
	const { url, html } = await fetchHtml(rawUrl);
	const { draft, method } = parseHtmlRecipe(html);
	draft.source_url = url.toString();
	return { draft, method, thin: isThin(draft) };
}

export function importFromText(text: string): ImportResult {
	const draft = parsePlainRecipe(text);
	return { draft, method: 'text', thin: isThin(draft) };
}

// ---------------------------------------------------------------------------
// AI — only on an explicit request. URL/text AI runs the parser first and asks
// the model to *correct that draft* against the source (smaller, safer job).
// ---------------------------------------------------------------------------

async function refine(rough: RecipeInput, source: string): Promise<RecipeInput> {
	// the draft is the primary input; a trimmed slice of source text is just
	// context for filling gaps — a full stripped page (nav/footer/related) both
	// wastes tokens and pushes latency past the timeout.
	const prompt = `${REFINE_PROMPT}\n\n=== PARSED ===\n${serializeRecipe(rough)}\n\n=== SOURCE ===\n${source.slice(0, 8_000)}`;
	return parsePlainRecipe(await callGemini([{ text: prompt }]));
}

export async function importFromUrlWithAi(rawUrl: string): Promise<ImportResult> {
	const { url, html } = await fetchHtml(rawUrl);
	const { draft: rough } = parseHtmlRecipe(html);
	const draft = await refine(rough, stripHtml(html));
	draft.source_url = url.toString();
	return { draft, method: 'ai', thin: isThin(draft) };
}

export async function importFromTextWithAi(text: string): Promise<ImportResult> {
	const draft = await refine(parsePlainRecipe(text), text);
	return { draft, method: 'ai', thin: isThin(draft) };
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function importFromImage(bytes: Uint8Array, mime: string): Promise<ImportResult> {
	if (!IMAGE_TYPES.has(mime)) throw new ImportError('Upload a JPEG, PNG or WebP photo.');
	if (bytes.byteLength > 8_000_000) throw new ImportError('That image is too large (max 8 MB).');
	const b64 = Buffer.from(bytes).toString('base64');
	const draft = parsePlainRecipe(
		await callGemini([{ text: GEMINI_PROMPT }, { inlineData: { mimeType: mime, data: b64 } }])
	);
	return { draft, method: 'ai', thin: isThin(draft) };
}

/**
 * "Tidy with AI" from the editor. With no `instruction`, runs a general cleanup;
 * with one ("make all amounts grams", "halve it", "simplify the steps") that
 * becomes the sole directive.
 */
export async function tidyRecipe(input: RecipeInput, instruction = ''): Promise<RecipeInput> {
	const task = instruction.trim() ? TIDY_INSTRUCTION_PROMPT(instruction.trim()) : TIDY_PROMPT;
	const out = parsePlainRecipe(await callGemini([{ text: `${task}\n\n${serializeRecipe(input)}` }]));
	out.source_url = input.source_url;
	return out;
}

export function aiConfigured(): boolean {
	return !!env.LIST_GEMINI_API_KEY?.trim();
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function callGemini(parts: GeminiPart[]): Promise<string> {
	const key = env.LIST_GEMINI_API_KEY?.trim();
	if (!key) throw new ImportError('AI import is not configured (set LIST_GEMINI_API_KEY).');
	const model = env.LIST_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

	const res = await fetchWithTimeout(
		new URL(
			`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
		),
		75_000,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				contents: [{ role: 'user', parts }],
				generationConfig: {
					responseMimeType: 'text/plain',
					temperature: 0.2,
					// straight extraction/reformatting — skip 2.5's reasoning pass
					// (roughly triples latency). Ignored by models that predate it.
					thinkingConfig: { thinkingBudget: 0 }
				}
			})
		}
	);
	if (res.status === 503) throw new ImportError('The AI service is busy — try again in a moment.');
	if (!res.ok) {
		throw new ImportError(`Gemini returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
	}
	const json = (await res.json()) as {
		candidates?: { content?: { parts?: { text?: string }[] } }[];
	};
	const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
	if (!text.trim()) throw new ImportError('Gemini returned an empty response.');
	return text;
}

// ---------------------------------------------------------------------------
// JSON-LD (schema.org/Recipe)
// ---------------------------------------------------------------------------

export function parseJsonLdRecipe(html: string): RecipeInput | null {
	const blocks = [
		...html.matchAll(
			/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
		)
	];
	for (const [, raw] of blocks) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw.trim());
		} catch {
			continue;
		}
		const recipe = findRecipeNode(parsed);
		if (recipe) return jsonLdToInput(recipe);
	}
	return null;
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
	if (Array.isArray(node)) {
		for (const n of node) {
			const found = findRecipeNode(n);
			if (found) return found;
		}
		return null;
	}
	if (node && typeof node === 'object') {
		const obj = node as Record<string, unknown>;
		const type = obj['@type'];
		const isRecipe = Array.isArray(type)
			? type.some((t) => String(t).toLowerCase() === 'recipe')
			: String(type ?? '').toLowerCase() === 'recipe';
		if (isRecipe) return obj;
		if (obj['@graph']) return findRecipeNode(obj['@graph']);
	}
	return null;
}

function jsonLdToInput(r: Record<string, unknown>): RecipeInput {
	const out = emptyRecipeInput();
	out.title = asText(r.name).trim();
	out.servings = firstText(r.recipeYield).trim();

	for (const line of asStringList(r.recipeIngredient)) {
		const ing = parseIngredientText(line);
		if (ing.name) out.ingredients.push(ing);
	}

	out.steps = flattenInstructions(r.recipeInstructions).map(({ group, body }) => ({
		body,
		group,
		ingredientIds: [],
		includes: []
	}));
	linkStepsByProse(out);
	return out;
}

/** Structured markup gives no step<->ingredient linkage; derive it from the prose. */
function linkStepsByProse(out: RecipeInput): void {
	for (const step of out.steps) {
		step.ingredientIds = matchIngredientsInProse(step.body, out.ingredients);
	}
}

function flattenInstructions(instr: unknown): { group: string; body: string }[] {
	if (instr == null) return [];
	if (typeof instr === 'string') {
		return splitParagraphs(instr).map((body) => ({ group: '', body }));
	}
	if (!Array.isArray(instr)) instr = [instr];
	const out: { group: string; body: string }[] = [];
	for (const el of instr as unknown[]) {
		if (typeof el === 'string') {
			out.push({ group: '', body: el.trim() });
			continue;
		}
		if (!el || typeof el !== 'object') continue;
		const obj = el as Record<string, unknown>;
		const type = String(obj['@type'] ?? '').toLowerCase();
		if (type === 'howtosection') {
			const group = asText(obj.name).trim();
			for (const item of flattenInstructions(obj.itemListElement)) {
				out.push({ group, body: item.body });
			}
		} else {
			out.push({ group: '', body: asText(obj.text ?? obj.name).trim() });
		}
	}
	return out.filter((s) => s.body);
}

// ---------------------------------------------------------------------------
// Microdata / RDFa (itemprop="recipeIngredient" etc.) — a lighter structured
// fallback for pages without JSON-LD.
// ---------------------------------------------------------------------------

export function parseMicrodataRecipe(html: string): RecipeInput | null {
	const propValues = (prop: string): string[] => {
		const re = new RegExp(
			`<([a-z0-9]+)[^>]*itemprop=["'](?:[^"']*\\s)?${prop}(?:\\s[^"']*)?["'][^>]*>([\\s\\S]*?)</\\1>`,
			'gi'
		);
		const out: string[] = [];
		for (const m of html.matchAll(re)) {
			const text = stripHtml(m[2]).replace(/\s+/g, ' ').trim();
			if (text) out.push(text);
		}
		return out;
	};

	const ingredients = [...propValues('recipeIngredient'), ...propValues('ingredients')];
	const instructions = [...propValues('recipeInstructions'), ...propValues('recipeInstruction')];
	if (ingredients.length < 2) return null;

	const out = emptyRecipeInput();
	out.title = propValues('name')[0] ?? '';
	out.servings = propValues('recipeYield')[0] ?? '';
	for (const line of ingredients) {
		const ing = parseIngredientText(line);
		if (ing.name) out.ingredients.push(ing);
	}
	const steps =
		instructions.length === 1
			? splitParagraphs(instructions[0])
			: instructions.map((s) => s.trim()).filter(Boolean);
	out.steps = steps.map((body) => ({ body, group: '', ingredientIds: [], includes: [] }));
	linkStepsByProse(out);
	return out;
}

function splitParagraphs(s: string): string[] {
	const byBlank = s.split(/\n\s*\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
	if (byBlank.length > 1) return byBlank;
	// a single blob of instructions — split into sentences
	return (byBlank[0] ?? '')
		.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
		.map((l) => l.trim())
		.filter((l) => l.length > 1);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function asText(v: unknown): string {
	if (typeof v === 'string') return v;
	if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(', ');
	if (v && typeof v === 'object') {
		const o = v as Record<string, unknown>;
		if (typeof o['@value'] === 'string') return o['@value'];
	}
	return v == null ? '' : String(v);
}

function firstText(v: unknown): string {
	return Array.isArray(v) ? asText(v[0]) : asText(v);
}

function asStringList(v: unknown): string[] {
	if (v == null) return [];
	if (typeof v === 'string') return splitLines(v);
	if (Array.isArray(v)) return v.map(asText).map((s) => s.trim()).filter(Boolean);
	return [asText(v)].filter(Boolean);
}

function splitLines(s: string): string[] {
	return s
		.split(/\r?\n+/)
		.map((l) => l.trim())
		.filter(Boolean);
}

export function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&quot;/gi, '"')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n\s*\n\s*\n+/g, '\n\n')
		.trim();
}

function assertPublicHttpUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new ImportError('That does not look like a URL.');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new ImportError('Only http(s) URLs are supported.');
	}
	return url;
}

async function assertNotPrivateHost(hostname: string): Promise<void> {
	const host = hostname.replace(/^\[|\]$/g, '');
	const literals = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
	for (const ip of literals) {
		if (isPrivateAddress(ip)) {
			throw new ImportError('That host is not allowed.');
		}
	}
	if (!literals.length) throw new ImportError('Could not resolve that host.');
}

export function isPrivateAddress(ip: string): boolean {
	if (isIP(ip) === 6) {
		const l = ip.toLowerCase();
		if (l.startsWith('::ffff:')) return isPrivateAddress(l.slice(7)); // v4-mapped
		return (
			l === '::1' ||
			l === '::' ||
			l.startsWith('fe80:') || // link-local
			l.startsWith('fc') ||
			l.startsWith('fd') // unique local
		);
	}
	const p = ip.split('.').map(Number);
	if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // unknown -> refuse
	const [a, b] = p;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127) ||
		a >= 224
	);
}

async function fetchWithTimeout(url: URL, ms: number, init?: RequestInit): Promise<Response> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), ms);
	try {
		return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' });
	} catch (e) {
		if ((e as Error).name === 'AbortError') throw new ImportError('The request timed out.');
		throw new ImportError(`Could not fetch that URL: ${(e as Error).message}`);
	} finally {
		clearTimeout(t);
	}
}

async function readCapped(res: Response, cap: number): Promise<string> {
	const buf = await res.arrayBuffer();
	if (buf.byteLength > cap) throw new ImportError('That page is too large to import.');
	return new TextDecoder('utf-8').decode(buf);
}
