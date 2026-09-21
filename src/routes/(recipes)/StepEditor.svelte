<script lang="ts">
	import { tokenizeStepBody, type StepSegment } from '$lib/recipe-parse';

	let { body = $bindable(''), placeholder = 'Write this step…' }: { body: string; placeholder?: string } = $props();

	let el = $state<HTMLDivElement>();
	// the last value WE derived from the DOM via onInput — if `body` still equals
	// this, the effect's dependency changed only because of our own edit, so the
	// DOM is already correct and must not be rewritten (that would reset the
	// caret). `undefined` on mount guarantees the very first render still runs.
	let lastEmitted: string | undefined;

	function segToToken(seg: StepSegment): string {
		if (seg.type === 'ingredient') {
			const inner =
				(seg.quantity || seg.unit ? `${seg.quantity}%${seg.unit}` : '') +
				(seg.quantity2 || seg.unit2 ? `|${seg.quantity2}%${seg.unit2}` : '');
			return `@${seg.name}{${inner}}`;
		}
		if (seg.type === 'timer') return `~${seg.label}{${seg.quantity}%${seg.unit}}`;
		return '';
	}

	/** body (plain text w/ tokens) -> chip-rendered innerHTML */
	function render(text: string): string {
		return tokenizeStepBody(text)
			.map((seg) => {
				if (seg.type === 'text') return escapeHtml(seg.text);
				if (seg.type === 'comment') return `<span class="chip chip-cmt" contenteditable="false" data-token="${escapeAttr(' -- ' + seg.text)}">${escapeHtml(seg.text)}</span>`;
				const token = segToToken(seg);
				const label = seg.type === 'ingredient' ? seg.name : `⏱ ${seg.label || ''} ${seg.quantity}${seg.unit}`.trim();
				const cls = seg.type === 'ingredient' ? 'chip chip-ing' : 'chip chip-timer';
				return `<span class="${cls}" contenteditable="false" data-token="${escapeAttr(token)}">${escapeHtml(label)}</span>`;
			})
			.join('');
	}

	/** current DOM content -> plain text w/ tokens (reads data-token off each chip span) */
	function serialize(node: Node): string {
		let out = '';
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? '';
			else if (child instanceof HTMLElement && child.dataset.token !== undefined) out += child.dataset.token;
			else if (child instanceof HTMLElement) out += serialize(child);
		}
		return out;
	}

	function escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
	function escapeAttr(s: string): string {
		return escapeHtml(s).replace(/"/g, '&quot;');
	}

	function onInput() {
		if (!el) return;
		lastEmitted = serialize(el);
		body = lastEmitted;
	}

	// keep the DOM in sync when `body` changes from outside this component
	// (e.g. a toolbar action elsewhere, or the initial load) — but never while
	// the user is mid-edit here, or the caret would jump.
	$effect(() => {
		if (!el || body === lastEmitted) return;
		const wanted = render(body);
		if (el.innerHTML !== wanted) el.innerHTML = wanted;
	});
</script>

<div
	bind:this={el}
	class="step-editable"
	contenteditable="true"
	data-placeholder={placeholder}
	oninput={onInput}
></div>

<style>
	.step-editable {
		min-height: 2.4rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface-1);
		font-size: 0.92rem;
		line-height: 1.5;
		outline: none;
	}
	.step-editable:focus { border-color: var(--accent); }
	.step-editable:empty::before {
		content: attr(data-placeholder);
		color: var(--text-3);
	}
	:global(.chip) {
		display: inline-block;
		border-radius: 0.3rem;
		padding: 0 0.3rem;
		margin: 0 0.05rem;
		user-select: none;
	}
	:global(.chip-ing) { background: var(--accent-weak); }
	:global(.chip-timer) { background: var(--surface-2); font-size: 0.9em; white-space: nowrap; }
	:global(.chip-cmt) { background: none; color: var(--text-3); font-size: 0.9em; }
</style>
