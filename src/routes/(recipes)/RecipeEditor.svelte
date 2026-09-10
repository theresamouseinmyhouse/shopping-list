<script lang="ts">
	import { untrack, tick } from 'svelte';
	import {
		displayAmount,
		matchIngredientsInProse,
		type RecipeInput
	} from '$lib/recipe';
	import { normalizeName } from '$lib/types';
	import {
		parseIngredientsBlock,
		parseMethod,
		serializeIngredients,
		serializeMethod
	} from '$lib/recipe-parse';

	let {
		initial,
		recipes = [],
		catalog = [],
		action,
		submitLabel = 'Save',
		ai = false
	}: {
		initial: RecipeInput;
		recipes?: { id: string; title: string }[];
		catalog?: string[];
		action: string;
		submitLabel?: string;
		ai?: boolean;
	} = $props();

	const seed = untrack(() => initial);
	let title = $state(seed.title);
	let servings = $state(seed.servings);
	let notes = $state(seed.notes);
	let sourceUrl = $state(seed.source_url);
	let ingredientsText = $state(serializeIngredients(seed.ingredients, seed.miseEnPlaceIncludes));
	let methodText = $state(
		serializeMethod(seed.steps.map((s) => ({ body: s.body, group: s.group, includes: s.includes })))
	);

	const parsedIng = $derived(parseIngredientsBlock(ingredientsText));
	const parsedMethod = $derived(parseMethod(methodText));

	const payload = $derived(
		JSON.stringify({
			title,
			servings,
			notes,
			source_url: sourceUrl,
			ingredients: parsedIng.ingredients,
			miseEnPlaceIncludes: [...parsedIng.includes, ...parsedMethod.leadingIncludes],
			steps: parsedMethod.steps
		} satisfies RecipeInput)
	);

	// ---- "+ " sub-recipe autocomplete inside the textareas -------------------
	let ingEl = $state<HTMLTextAreaElement>();
	let methodEl = $state<HTMLTextAreaElement>();
	let subTarget = $state<'ing' | 'method' | null>(null);
	let subQuery = $state('');
	let subIndex = $state(0);
	const recipeTitleSet = $derived(new Set(recipes.map((r) => normalizeName(r.title))));

	const subMatches = $derived.by(() => {
		if (subTarget === null) return [];
		const q = subQuery.trim().toLowerCase();
		return recipes
			.filter((r) => !q || r.title.toLowerCase().includes(q))
			.slice(0, 8);
	});

	function lineRange(ta: HTMLTextAreaElement) {
		const v = ta.value;
		const pos = ta.selectionStart;
		const start = v.lastIndexOf('\n', pos - 1) + 1;
		let end = v.indexOf('\n', pos);
		if (end === -1) end = v.length;
		return { start, end, line: v.slice(start, end) };
	}

	function onTextareaInput(which: 'ing' | 'method') {
		const ta = which === 'ing' ? ingEl : methodEl;
		if (!ta) return;
		const m = lineRange(ta).line.match(/^\s*\+[ \t]*(.*)$/);
		if (m) {
			subTarget = which;
			subQuery = m[1];
			subIndex = 0;
		} else {
			subTarget = null;
		}
	}

	async function pickSub(title: string) {
		const ta = subTarget === 'ing' ? ingEl : methodEl;
		if (!ta) return;
		const { start, end } = lineRange(ta);
		const newLine = `+ ${title}`;
		const next = ta.value.slice(0, start) + newLine + ta.value.slice(end);
		if (subTarget === 'ing') ingredientsText = next;
		else methodText = next;
		subTarget = null;
		await tick();
		ta.focus();
		const caret = start + newLine.length;
		ta.setSelectionRange(caret, caret);
	}

	// ---- markup helper buttons ---------------------------------------------
	async function focusCaret(ta: HTMLTextAreaElement, caret: number) {
		await tick();
		ta.focus();
		ta.setSelectionRange(caret, caret);
	}

	/** insert `prefix` on a fresh line at the cursor (reusing the current line if blank) */
	async function insertLine(which: 'ing' | 'method', prefix: string, openSub = false) {
		const ta = which === 'ing' ? ingEl : methodEl;
		if (!ta) return;
		const isIng = which === 'ing';
		const text = isIng ? ingredientsText : methodText;
		const pos = ta.selectionStart ?? text.length;
		const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
		let lineEnd = text.indexOf('\n', pos);
		if (lineEnd === -1) lineEnd = text.length;
		const lineEmpty = text.slice(lineStart, lineEnd).trim() === '';
		const at = lineEmpty ? lineStart : lineEnd;
		const ins = lineEmpty ? prefix : '\n' + prefix;
		const caret = at + ins.length;
		const next = text.slice(0, at) + ins + text.slice(at);
		if (isIng) ingredientsText = next;
		else methodText = next;
		await focusCaret(ta, caret);
		if (openSub) onTextareaInput(which);
	}

	/** method only: blank line = new step */
	async function newStep() {
		if (!methodEl) return;
		const pos = methodEl.selectionStart ?? methodText.length;
		const before = methodText.slice(0, pos).replace(/\s+$/, '');
		const after = methodText.slice(pos).replace(/^\s+/, '');
		methodText = `${before}\n\n${after}`;
		await focusCaret(methodEl, before.length + 2);
	}

	function onSubKeydown(e: KeyboardEvent) {
		if (subTarget === null || subMatches.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			subIndex = (subIndex + 1) % subMatches.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			subIndex = (subIndex - 1 + subMatches.length) % subMatches.length;
		} else if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			pickSub(subMatches[subIndex].title);
		} else if (e.key === 'Escape') {
			subTarget = null;
		}
	}

	// includes typed in the textareas that don't match any known recipe
	const unresolved = $derived([
		...parsedIng.includes,
		...parsedMethod.leadingIncludes,
		...parsedMethod.steps.flatMap((s) => s.includes)
	].filter((t) => t && !recipeTitleSet.has(normalizeName(t))));

	function chip(i: (typeof parsedIng.ingredients)[number]) {
		const d = displayAmount(i);
		const amt = d.alt ? `${d.main} (${d.alt})` : d.main;
		return `${amt ? amt + ' ' : ''}${i.name}${i.comment ? ` · ${i.comment}` : ''}`.trim();
	}
	const proseIds = (body: string) =>
		matchIngredientsInProse(body, parsedIng.ingredients).map(
			(id) => parsedIng.ingredients.find((x) => x.id === id)!
		);

	let tidyOpen = $state(false);
	let tidyInstruction = $state('');
	let tidying = $state(false);
	let tidyErr = $state('');
	async function tidy() {
		tidying = true;
		tidyErr = '';
		try {
			const res = await fetch('/recipes/tidy', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ recipe: JSON.parse(payload), instruction: tidyInstruction.trim() })
			});
			if (!res.ok) throw new Error(await res.text());
			const { recipe } = (await res.json()) as { recipe: RecipeInput };
			title = recipe.title || title;
			servings = recipe.servings || servings;
			if (recipe.notes) notes = recipe.notes;
			ingredientsText = serializeIngredients(recipe.ingredients, recipe.miseEnPlaceIncludes);
			methodText = serializeMethod(
				recipe.steps.map((s) => ({ body: s.body, group: s.group, includes: s.includes }))
			);
			tidyOpen = false;
			tidyInstruction = '';
		} catch (e) {
			tidyErr = e instanceof Error ? e.message.slice(0, 200) : 'Tidy failed';
		} finally {
			tidying = false;
		}
	}
</script>

<form method="POST" {action} class="editor">
	<input type="hidden" name="payload" value={payload} />

	<label class="fieldrow">
		<span>Title</span>
		<input class="field" bind:value={title} required />
	</label>
	<div class="row2">
		<label class="fieldrow"><span>Servings</span><input class="field" bind:value={servings} placeholder="4" /></label>
		<label class="fieldrow"><span>Source URL</span><input class="field" bind:value={sourceUrl} placeholder="optional" /></label>
	</div>
	<label class="fieldrow"><span>Notes</span><textarea class="field" bind:value={notes}></textarea></label>

	<section class="card">
		<h3>Ingredients</h3>
		<p class="hint">One per line: <code>1 1/2 cups flour (sifted)</code>. <code>2 lb | 900 g</code> for two measures.</p>
		<div class="mkbar">
			<button type="button" class="mk-btn" onclick={() => insertLine('ing', '## ')}>＋ Group heading</button>
			<button type="button" class="mk-btn" onclick={() => insertLine('ing', '+ ', true)}>＋ Sub-recipe</button>
		</div>
		<div class="ta-wrap">
			<textarea
				class="field big"
				bind:value={ingredientsText}
				bind:this={ingEl}
				spellcheck="false"
				oninput={() => onTextareaInput('ing')}
				onkeydown={onSubKeydown}
				onclick={() => onTextareaInput('ing')}
				onblur={() => setTimeout(() => (subTarget === 'ing' ? (subTarget = null) : null), 150)}
			></textarea>
			{#if subTarget === 'ing' && subMatches.length}
				<ul class="subdrop">
					{#each subMatches as r, k (r.id)}
						<li>
							<button type="button" class:on={k === subIndex} onmousedown={(e) => { e.preventDefault(); pickSub(r.title); }}>
								{r.title}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		{#if parsedIng.ingredients.length}
			<div class="preview">
				{#each parsedIng.ingredients as i (i.id)}
					<span class="tag" class:linked={catalog.includes(i.name)}>{chip(i)}</span>
				{/each}
			</div>
		{/if}
		<datalist id="rec-catalog">{#each catalog as n (n)}<option value={n}></option>{/each}</datalist>
	</section>

	<section class="card">
		<h3>Method</h3>
		<p class="hint">Write the steps as prose — one step per paragraph. Name ingredients where you use them and they link automatically.</p>
		<div class="mkbar">
			<button type="button" class="mk-btn" onclick={newStep}>＋ Step</button>
			<button type="button" class="mk-btn" onclick={() => insertLine('method', '## ')}>＋ Section</button>
			<button type="button" class="mk-btn" onclick={() => insertLine('method', '+ ', true)}>＋ Sub-recipe</button>
		</div>
		<div class="ta-wrap">
			<textarea
				class="field big"
				bind:value={methodText}
				bind:this={methodEl}
				oninput={() => onTextareaInput('method')}
				onkeydown={onSubKeydown}
				onclick={() => onTextareaInput('method')}
				onblur={() => setTimeout(() => (subTarget === 'method' ? (subTarget = null) : null), 150)}
			></textarea>
			{#if subTarget === 'method' && subMatches.length}
				<ul class="subdrop">
					{#each subMatches as r, k (r.id)}
						<li>
							<button type="button" class:on={k === subIndex} onmousedown={(e) => { e.preventDefault(); pickSub(r.title); }}>
								{r.title}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		{#if parsedMethod.steps.length}
			<ol class="steps">
				{#each parsedMethod.steps as s, i (i)}
					<li>
						{#if s.group}<span class="grp">{s.group}</span>{/if}
						<span class="stepbody">{s.body}</span>
						{#if proseIds(s.body).length}
							<span class="uses">
								{#each proseIds(s.body) as ing (ing.id)}<span class="tag sm">{[ing.quantity, ing.unit].filter(Boolean).join(' ')} {ing.name}</span>{/each}
							</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	{#if unresolved.length}
		<p class="warn">
			No recipe named {unresolved.map((t) => `“${t}”`).join(', ')} — a
			<code>+</code> line only embeds a recipe that already exists.
		</p>
	{/if}

	{#if ai && tidyOpen}
		<div class="tidybox">
			<label for="tidy-inst">Tidy with AI — what should it do?</label>
			<textarea
				id="tidy-inst"
				class="field"
				rows="2"
				bind:value={tidyInstruction}
				placeholder="e.g. put all the ingredient amounts in grams  ·  leave blank for a general cleanup"
			></textarea>
			<div class="tidybtns">
				<button type="button" class="btn btn-sm" onclick={() => (tidyOpen = false)} disabled={tidying}>Cancel</button>
				<button type="button" class="btn btn-sm btn-primary" onclick={tidy} disabled={tidying}>
					{tidying ? 'Working…' : tidyInstruction.trim() ? 'Apply' : 'Clean up'}
				</button>
			</div>
		</div>
	{/if}
	{#if tidyErr}<p class="tidyerr">{tidyErr}</p>{/if}
	<div class="actions">
		{#if ai}
			<button type="button" class="btn btn-sm" onclick={() => (tidyOpen = !tidyOpen)} disabled={tidying}>
				✨ Tidy with AI
			</button>
		{/if}
		<button type="submit" class="btn btn-sm btn-primary">{submitLabel}</button>
	</div>
</form>

<style>
	.editor { display: flex; flex-direction: column; gap: 0.8rem; }
	.fieldrow { display: flex; flex-direction: column; gap: 0.25rem; }
	.fieldrow > span { font-size: 0.8rem; color: var(--text-2); }
	.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
	.card { border: 1px solid var(--line); border-radius: 0.6rem; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.card h3 { margin: 0; font-size: 0.95rem; }
	.hint { margin: 0; font-size: 0.76rem; color: var(--text-2); line-height: 1.5; }
	.hint code { background: var(--surface-2); border-radius: 0.25rem; padding: 0 0.25rem; }
	.mkbar { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.mk-btn {
		font-size: 0.75rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 0.4rem;
		background: var(--surface-2);
		color: var(--text-2);
		line-height: 1;
	}
	.mk-btn:active { background: var(--line); }
	.field.big { min-height: 8rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
	.preview { display: flex; flex-wrap: wrap; gap: 0.3rem; }
	.tag { background: var(--surface-2); border-radius: 999px; padding: 0.12rem 0.6rem; font-size: 0.8rem; }
	.tag.linked { background: var(--accent-weak); }
	.tag.sm { font-size: 0.72rem; padding: 0.05rem 0.45rem; }
	.ta-wrap { position: relative; }
	.subdrop {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		z-index: 20;
		margin: 0.15rem 0 0;
		padding: 0.2rem;
		list-style: none;
		background: var(--surface-1);
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
		max-height: 12rem;
		overflow-y: auto;
	}
	.subdrop button {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: 0;
		padding: 0.45rem 0.5rem;
		border-radius: 0.35rem;
		font-size: 0.9rem;
		color: inherit;
	}
	.subdrop button.on,
	.subdrop button:hover {
		background: var(--surface-2);
	}
	.warn {
		background: var(--danger-weak);
		color: var(--danger);
		border-radius: 0.5rem;
		padding: 0.5rem 0.7rem;
		font-size: 0.82rem;
		margin: 0;
	}
	.warn code { background: color-mix(in srgb, var(--danger) 18%, transparent); border-radius: 0.25rem; padding: 0 0.2rem; }
	.steps { margin: 0; padding-left: 1.3rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.steps li { font-size: 0.85rem; }
	.grp { display: block; font-weight: 600; color: var(--text-3); font-size: 0.75rem; text-transform: uppercase; }
	.stepbody { color: var(--text-2); }
	.uses { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; }
	.actions { position: sticky; bottom: 0; background: var(--surface-1); padding: 0.6rem 0; border-top: 1px solid var(--line); display: flex; gap: 0.5rem; }
	.actions .btn-primary { flex: 1; padding: 0.6rem; }
	.tidyerr { color: var(--danger); font-size: 0.82rem; margin: 0.3rem 0; }
	.tidybox { border: 1px solid var(--line); border-radius: 0.6rem; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.4rem; }
	.tidybox label { font-size: 0.85rem; font-weight: 600; }
	.tidybtns { display: flex; gap: 0.5rem; }
	.tidybtns .btn-primary { flex: 1; }
</style>
