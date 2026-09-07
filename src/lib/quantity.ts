// Parse a leading quantity out of a typed add ("4 milk", "two onions", "milk x3")
// and singularise so it matches the catalog. Shared by client and server.

const WORDS: Record<string, number> = {
	a: 1,
	an: 1,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	dozen: 12,
	couple: 2,
	pair: 2
};

const clamp = (n: number) => Math.max(1, Math.min(999, Math.round(n)));

export interface ParsedAdd {
	qty: number | null; // null = no quantity was stated
	name: string;
}

export function parseAdd(raw: string): ParsedAdd {
	const s = raw.trim().replace(/\s+/g, ' ');
	let m = s.match(/^(\d{1,3})\s*x?\s+(.+)$/i);
	if (m) return { qty: clamp(+m[1]), name: m[2].trim() };

	m = s.match(/^([a-z]+)\s+(.+)$/i);
	if (m && WORDS[m[1].toLowerCase()] != null) {
		return { qty: WORDS[m[1].toLowerCase()], name: m[2].trim() };
	}

	m = s.match(/^(.+?)\s*x\s*(\d{1,3})$/i);
	if (m) return { qty: clamp(+m[2]), name: m[1].trim() };

	return { qty: null, name: s };
}

function singularWord(w: string): string {
	if (/ies$/i.test(w) && w.length > 3) return w.slice(0, -3) + 'y';
	if (/(sses|shes|ches|xes|zes)$/i.test(w)) return w.slice(0, -2);
	if (/[^su]s$/i.test(w) && w.length > 3) return w.slice(0, -1); // milks, onions — not "us" (hummus, citrus)
	return w;
}

/** Singularise the last word: "chicken breasts" -> "chicken breast". */
export function singularizeName(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (!parts.length) return name;
	parts[parts.length - 1] = singularWord(parts[parts.length - 1]);
	return parts.join(' ');
}

/** Candidate names to match an add against an existing catalog item (case-insensitive elsewhere). */
export function nameVariants(name: string): string[] {
	const n = name.trim();
	const sing = singularizeName(n);
	const plural = /y$/i.test(sing) ? sing.slice(0, -1) + 'ies' : sing + 's';
	return [...new Set([n, sing, plural])];
}
