// Recipe scaling — parse a quantity string, multiply, format it back nicely.
// Display-only: the stored recipe never changes.

const VULGAR: Record<string, number> = {
	'¼': 0.25, '½': 0.5, '¾': 0.75, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1,
	'⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
	'⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

function token(t: string): number | null {
	t = t.trim();
	if (!t) return null;
	if (VULGAR[t] != null) return VULGAR[t];
	// "1½"
	const m = t.match(/^(\d+)([¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])$/);
	if (m) return Number(m[1]) + VULGAR[m[2]];
	if (/^\d+\/\d+$/.test(t)) {
		const [a, b] = t.split('/').map(Number);
		return b ? a / b : null;
	}
	if (/^\d*\.?\d+$/.test(t)) return Number(t);
	return null;
}

/** "1 1/2" -> 1.5, "2-3" -> {lo:2,hi:3}. null when there's no number. */
export function parseQuantity(text: string): { lo: number; hi: number } | null {
	const s = text.trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
	if (!s) return null;

	const range = s.match(/^(.+?)\s*-\s*(.+)$/);
	if (range) {
		const lo = parseQuantity(range[1]);
		const hi = parseQuantity(range[2]);
		if (lo && hi) return { lo: lo.lo, hi: hi.hi };
	}

	// sum space-separated tokens ("1 1/2", "1 ½")
	let total = 0;
	let any = false;
	for (const part of s.split(' ')) {
		const v = token(part);
		if (v == null) {
			// a token like "1½" glued, or trailing junk — bail if we've matched nothing
			if (!any) return null;
			break;
		}
		total += v;
		any = true;
	}
	return any ? { lo: total, hi: total } : null;
}

const EIGHTHS: [number, string][] = [
	[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'],
	[0.5, '½'], [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞'], [1, '']
];

/** 1.5 -> "1½", 0.625 -> "⅝", 2 -> "2". Snaps to a friendly fraction. */
export function formatQuantity(n: number): string {
	if (!isFinite(n) || n <= 0) return '';
	if (n >= 10) return String(Math.round(n)); // big numbers: whole is fine
	const whole = Math.floor(n);
	const frac = n - whole;
	let best = EIGHTHS[0];
	for (const e of EIGHTHS) if (Math.abs(frac - e[0]) < Math.abs(frac - best[0])) best = e;
	const carry = best[0] === 1 ? 1 : 0;
	const w = whole + carry;
	const f = carry ? '' : best[1];
	if (!f) return String(w || Math.round(n * 100) / 100 || '');
	return w ? `${w}${f}` : f;
}

/** Scale a quantity string by `factor`, keeping a range as a range. Unparseable
 *  quantities ("a pinch", "") come back unchanged. */
export function scaleQuantity(text: string, factor: number): string {
	if (factor === 1) return text;
	const q = parseQuantity(text);
	if (!q) return text;
	if (q.lo === q.hi) return formatQuantity(q.lo * factor);
	return `${formatQuantity(q.lo * factor)}-${formatQuantity(q.hi * factor)}`;
}

/** Factor that turns `recipeQty` of an ingredient into `haveQty` of it. */
export function factorFromHave(recipeQty: string, haveQty: number): number | null {
	const q = parseQuantity(recipeQty);
	if (!q || haveQty <= 0) return null;
	const mid = (q.lo + q.hi) / 2;
	return mid > 0 ? haveQty / mid : null;
}
