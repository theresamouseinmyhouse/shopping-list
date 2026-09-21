<script lang="ts">
	import { tokenizeStepBody, type StepSegment } from '$lib/recipe-parse';

	let {
		body = $bindable(''),
		placeholder = 'Write this step…',
		catalog = [] as string[]
	}: { body: string; placeholder?: string; catalog?: string[] } = $props();

	let el = $state<HTMLDivElement>();
	// the last value WE derived from the DOM via onInput — if `body` still equals
	// this, the effect's dependency changed only because of our own edit, so the
	// DOM is already correct and must not be rewritten (that would reset the
	// caret). `undefined` on mount guarantees the very first render still runs.
	let lastEmitted: string | undefined;

	let toolbar = $state<{ x: number; y: number; text: string; range: Range } | null>(null);

	function onSelectionChange() {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || !el || !sel.anchorNode || !el.contains(sel.anchorNode)) {
			toolbar = null;
			return;
		}
		const range = sel.getRangeAt(0).cloneRange();
		if (!el.contains(range.commonAncestorContainer)) {
			toolbar = null;
			return;
		}
		const text = range.toString().trim();
		if (!text) {
			toolbar = null;
			return;
		}
		const rect = range.getBoundingClientRect();
		toolbar = { x: rect.left + rect.width / 2, y: rect.top, text, range };
	}

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

	$effect(() => {
		document.addEventListener('selectionchange', onSelectionChange);
		return () => document.removeEventListener('selectionchange', onSelectionChange);
	});

	function wrapSelectionWithChip(token: string, label: string, cls: string) {
		if (!toolbar || !el) return;
		const chip = document.createElement('span');
		chip.className = `chip ${cls}`;
		chip.contentEditable = 'false';
		chip.dataset.token = token;
		chip.textContent = label;
		try {
			toolbar.range.deleteContents();
			toolbar.range.insertNode(chip);
			onInput();
		} catch {
			// the selection's Range went stale (DOM changed between selecting and
			// clicking, e.g. an external body update) — nothing to insert into.
		} finally {
			toolbar = null;
		}
	}

	const DURATION_RE = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i;

	function markTimer() {
		if (!toolbar) return;
		const m = toolbar.text.match(DURATION_RE);
		const qty = m ? m[1] : '';
		const unit = m ? m[2].toLowerCase() : '';
		wrapSelectionWithChip(`~{${qty}%${unit}}`, `⏱ ${qty}${unit ? ' ' + unit : ''}`.trim() || '⏱ timer', 'chip-timer');
	}

	function markIngredient() {
		if (!toolbar) return;
		// quantity/unit default empty — the user (or AI) rarely hand-annotates a
		// quantity via selection; this exists for quick "link this word" cases.
		// Fine-grained qty/unit entry happens through AI import in practice.
		wrapSelectionWithChip(`@${toolbar.text}{}`, toolbar.text, 'chip-ing');
	}

	function markNote() {
		if (!el) return;
		const text = toolbar?.text ?? '';
		try {
			if (toolbar) toolbar.range.deleteContents();
			el.appendChild(document.createTextNode(' '));
			const chip = document.createElement('span');
			chip.className = 'chip chip-cmt';
			chip.contentEditable = 'false';
			chip.dataset.token = `-- ${text}`;
			chip.textContent = text || 'note';
			el.appendChild(chip);
			onInput();
		} catch {
			// the selection's Range went stale (DOM changed between selecting and
			// clicking, e.g. an external body update) — nothing to delete/insert into.
		} finally {
			toolbar = null;
		}
	}
</script>

<div
	bind:this={el}
	class="step-editable"
	contenteditable="true"
	data-placeholder={placeholder}
	oninput={onInput}
></div>

{#if toolbar}
	<div class="seltoolbar" style="left:{toolbar.x}px; top:{toolbar.y - 8}px" role="toolbar">
		<button type="button" onmousedown={(e) => { e.preventDefault(); markIngredient(); }}>Ingredient</button>
		<button type="button" onmousedown={(e) => { e.preventDefault(); markTimer(); }}>Timer</button>
		<button type="button" onmousedown={(e) => { e.preventDefault(); markNote(); }}>Note</button>
	</div>
{/if}

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

	.seltoolbar {
		position: fixed;
		transform: translate(-50%, -100%);
		display: flex;
		gap: 0.2rem;
		background: var(--surface-1);
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		padding: 0.25rem;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
		z-index: 30;
	}
	.seltoolbar button {
		font-size: 0.78rem;
		padding: 0.3rem 0.55rem;
		border: 0;
		border-radius: 0.35rem;
		background: var(--surface-2);
		color: inherit;
	}
	.seltoolbar button:hover { background: var(--line); }
</style>
