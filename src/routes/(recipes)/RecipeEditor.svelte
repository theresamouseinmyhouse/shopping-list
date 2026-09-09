<script lang="ts">
	import { untrack } from 'svelte';
	import {
		displayAmount,
		matchIngredientsInProse,
		type RecipeInput
	} from '$lib/recipe';
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

	function addSub(target: 'ing' | 'method', e: Event) {
		const sel = e.target as HTMLSelectElement;
		if (!sel.value) return;
		const line = `+ ${sel.value}`;
		if (target === 'ing') ingredientsText = `${ingredientsText}\n${line}`.trim();
		else methodText = `${methodText}\n\n${line}`.trim();
		sel.value = '';
	}

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

	<label class="field">
		<span>Title</span>
		<input class="rec-input" bind:value={title} required />
	</label>
	<div class="row2">
		<label class="field"><span>Servings</span><input class="rec-input" bind:value={servings} placeholder="4" /></label>
		<label class="field"><span>Source URL</span><input class="rec-input" bind:value={sourceUrl} placeholder="optional" /></label>
	</div>
	<label class="field"><span>Notes</span><textarea class="rec-textarea" bind:value={notes}></textarea></label>

	<section class="card">
		<h3>Ingredients</h3>
		<p class="hint">One per line: <code>1 1/2 cups flour (sifted)</code>. <code>## For the sauce</code> starts a group. <code>2 lb | 900 g</code> for two measures.</p>
		<textarea class="rec-textarea big" bind:value={ingredientsText} spellcheck="false"></textarea>
		{#if parsedIng.ingredients.length}
			<div class="preview">
				{#each parsedIng.ingredients as i (i.id)}
					<span class="tag" class:linked={catalog.includes(i.name)}>{chip(i)}</span>
				{/each}
			</div>
		{/if}
		{#if recipes.length}
			<select class="sub" onchange={(e) => addSub('ing', e)}>
				<option value="">+ sub-recipe as an ingredient…</option>
				{#each recipes as r (r.id)}<option value={r.title}>{r.title}</option>{/each}
			</select>
		{/if}
		<datalist id="rec-catalog">{#each catalog as n (n)}<option value={n}></option>{/each}</datalist>
	</section>

	<section class="card">
		<h3>Method</h3>
		<p class="hint">Write the steps as prose — one step per paragraph (blank line between). Name ingredients where you use them and they link automatically. <code>## Section</code> for parts, <code>+ Gravy</code> to embed a recipe.</p>
		<textarea class="rec-textarea big" bind:value={methodText}></textarea>
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
		{#if recipes.length}
			<select class="sub" onchange={(e) => addSub('method', e)}>
				<option value="">+ embed a sub-recipe in a step…</option>
				{#each recipes as r (r.id)}<option value={r.title}>{r.title}</option>{/each}
			</select>
		{/if}
	</section>

	{#if ai && tidyOpen}
		<div class="tidybox">
			<label for="tidy-inst">Tidy with AI — what should it do?</label>
			<textarea
				id="tidy-inst"
				class="rec-textarea"
				rows="2"
				bind:value={tidyInstruction}
				placeholder="e.g. put all the ingredient amounts in grams  ·  leave blank for a general cleanup"
			></textarea>
			<div class="tidybtns">
				<button type="button" class="rec-btn" onclick={() => (tidyOpen = false)} disabled={tidying}>Cancel</button>
				<button type="button" class="rec-btn primary" onclick={tidy} disabled={tidying}>
					{tidying ? 'Working…' : tidyInstruction.trim() ? 'Apply' : 'Clean up'}
				</button>
			</div>
		</div>
	{/if}
	{#if tidyErr}<p class="tidyerr">{tidyErr}</p>{/if}
	<div class="actions">
		{#if ai}
			<button type="button" class="rec-btn" onclick={() => (tidyOpen = !tidyOpen)} disabled={tidying}>
				✨ Tidy with AI
			</button>
		{/if}
		<button type="submit" class="rec-btn primary">{submitLabel}</button>
	</div>
</form>

<style>
	.editor { display: flex; flex-direction: column; gap: 0.8rem; }
	.field { display: flex; flex-direction: column; gap: 0.25rem; }
	.field > span { font-size: 0.8rem; color: var(--muted); }
	.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
	.card { border: 1px solid var(--line); border-radius: 0.6rem; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.card h3 { margin: 0; font-size: 0.95rem; }
	.hint { margin: 0; font-size: 0.76rem; color: var(--muted); line-height: 1.5; }
	.hint code { background: var(--surface-2); border-radius: 0.25rem; padding: 0 0.25rem; }
	.rec-textarea.big { min-height: 8rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
	.preview { display: flex; flex-wrap: wrap; gap: 0.3rem; }
	.tag { background: var(--surface-2); border-radius: 999px; padding: 0.12rem 0.6rem; font-size: 0.8rem; }
	.tag.linked { background: color-mix(in srgb, var(--accent) 14%, transparent); }
	.tag.sm { font-size: 0.72rem; padding: 0.05rem 0.45rem; }
	.sub { padding: 0.4rem; border: 1px solid var(--line); border-radius: 0.5rem; background: var(--surface); color: inherit; font: inherit; align-self: flex-start; }
	.steps { margin: 0; padding-left: 1.3rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.steps li { font-size: 0.85rem; }
	.grp { display: block; font-weight: 600; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; }
	.stepbody { color: var(--muted); }
	.uses { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; }
	.actions { position: sticky; bottom: 0; background: var(--bg); padding: 0.6rem 0; border-top: 1px solid var(--line); display: flex; gap: 0.5rem; }
	.actions .primary { flex: 1; padding: 0.6rem; }
	.tidyerr { color: var(--danger); font-size: 0.82rem; margin: 0.3rem 0; }
	.tidybox { border: 1px solid var(--line); border-radius: 0.6rem; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.4rem; }
	.tidybox label { font-size: 0.85rem; font-weight: 600; }
	.tidybtns { display: flex; gap: 0.5rem; }
	.tidybtns .primary { flex: 1; }
</style>
