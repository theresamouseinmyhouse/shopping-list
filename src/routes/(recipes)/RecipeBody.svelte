<script lang="ts">
	import { type ResolvedRecipe, type ResolvedChild, type ResolvedIngredient } from '$lib/recipe';
	import { formatAmount } from '$lib/units';
	import { scaleQuantity, parseQuantity, formatQuantity } from '$lib/scale';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Self from './RecipeBody.svelte';

	let {
		recipe,
		embedded = false,
		hideTitle = false,
		scale = 1
	}: { recipe: ResolvedRecipe; embedded?: boolean; hideTitle?: boolean; scale?: number } = $props();

	// collapsed embedded sub-recipes — remembered per device, keyed by sub-recipe id
	// ("I already made the bacon bits" stays collapsed wherever that recipe is embedded)
	let collapsed = $state<Record<string, boolean>>({});
	try {
		collapsed = JSON.parse(localStorage.getItem('recipe.collapsed') || '{}');
	} catch {
		/* private mode / bad json */
	}
	function toggleEmbed(id: string) {
		collapsed[id] = !collapsed[id];
		try {
			localStorage.setItem('recipe.collapsed', JSON.stringify(collapsed));
		} catch {
			/* ignore */
		}
	}

	const one = (q: string, u: string) => formatAmount(scaleQuantity(q, scale), u);

	function amount(i: ResolvedIngredient) {
		const a = one(i.quantity, i.unit);
		const b = one(i.quantity2, i.unit2);
		const [main, alt] = i.preferAlt && b ? [b, a] : [a, b];
		return alt ? `${main} (${alt})` : main;
	}

	const scaledServings = $derived.by(() => {
		if (scale === 1 || !recipe.servings) return recipe.servings;
		const q = parseQuantity(recipe.servings);
		return q
			? recipe.servings.replace(/^[\d./\s¼½¾⅓⅔⅛⅜⅝⅞-]+/, formatQuantity(((q.lo + q.hi) / 2) * scale) + ' ')
			: `${recipe.servings} (×${formatQuantity(scale)})`;
	});

	// group the ingredient list by its group label, preserving order
	const groups = $derived.by(() => {
		const map = new Map<string, ResolvedIngredient[]>();
		for (const i of recipe.ingredients) {
			const k = i.group || '';
			if (!map.has(k)) map.set(k, []);
			map.get(k)!.push(i);
		}
		return [...map.entries()];
	});
</script>

{#snippet child(c: ResolvedChild)}
	{#if c.kind === 'recipe'}
		<div class="embed" class:collapsed={collapsed[c.recipe.id]}>
			<button
				type="button"
				class="embed-head"
				aria-expanded={!collapsed[c.recipe.id]}
				onclick={() => toggleEmbed(c.recipe.id)}
			>
				<ChevronDown class="chev" size={16} />
				<span class="embed-title">{c.recipe.title}</span>
				{#if collapsed[c.recipe.id]}<span class="embed-more">show</span>{/if}
			</button>
			<div class="embed-body" hidden={collapsed[c.recipe.id]}>
				<Self recipe={c.recipe} embedded hideTitle {scale} />
			</div>
		</div>
	{:else if c.kind === 'cycle'}
		<p class="note">↻ see “{c.title}” above</p>
	{:else}
		<p class="note">· “{c.title}” (no such recipe)</p>
	{/if}
{/snippet}

{#if !hideTitle}
	<svelte:element this={embedded ? 'h3' : 'h1'} class="title">{recipe.title}</svelte:element>
{/if}
{#if recipe.servings}<p class="meta">Serves {scaledServings}{#if scale !== 1}<span class="scaled"> · scaled ×{formatQuantity(scale)}</span>{/if}</p>{/if}
{#if recipe.notes}<p class="notes">{recipe.notes}</p>{/if}

{#if recipe.ingredients.length}
	<h2>Ingredients</h2>
	{#each groups as [label, items] (label)}
		{#if label}<h5>{label}</h5>{/if}
		<ul class="mise">
			{#each items as i (i.id)}
				<li>
					<span class="amt">{amount(i)}</span>
					<span>{i.name}{#if i.comment}<span class="cmt">, {i.comment}</span>{/if}</span>
				</li>
			{/each}
		</ul>
	{/each}
{/if}

{#each recipe.components as c, i (i)}{@render child(c)}{/each}

{#if recipe.steps.length}
	<h2>Method</h2>
	<ol class="steps">
		{#each recipe.steps as s, i (s.id)}
			{#if s.group && (i === 0 || recipe.steps[i - 1].group !== s.group)}
				<h5 class="stepgrp">{s.group}</h5>
			{/if}
			<li class="step">
				<p class="body">{s.body}</p>
				{#if s.ingredients.length}
					<p class="stepings">
						{#each s.ingredients as ing (ing.id)}<span class="pill">{amount(ing)} {ing.name}</span>{/each}
					</p>
				{/if}
				{#each s.children as c, k (k)}{@render child(c)}{/each}
			</li>
		{/each}
	</ol>
{/if}

<style>
	.title { margin: 0.2rem 0; }
	.meta { color: var(--muted); margin: 0 0 0.6rem; font-size: 0.9rem; }
	.scaled { color: var(--accent); }
	.notes { margin: 0 0 0.8rem; white-space: pre-wrap; }
	h2 { font-size: 1rem; margin: 1rem 0 0.4rem; border-bottom: 1px solid var(--line); padding-bottom: 0.2rem; }
	h5 { margin: 0.5rem 0 0.2rem; font-size: 0.82rem; text-transform: uppercase; color: var(--muted); letter-spacing: 0.03em; }
	h5.stepgrp { padding-left: 0; }
	.mise { margin: 0 0 0.5rem; padding-left: 1.1rem; }
	.mise li { margin: 0.15rem 0; }
	.amt { display: inline-block; min-width: 5.5rem; color: var(--muted); }
	.cmt { color: var(--muted); }
	.steps { margin: 0; padding-left: 1.3rem; }
	.step { margin: 0.6rem 0; }
	.body { margin: 0.3rem 0; white-space: pre-wrap; }
	.stepings { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0.2rem 0; }
	.pill { background: var(--surface-2); border-radius: 999px; padding: 0.1rem 0.55rem; font-size: 0.8rem; }
	.embed { border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 0.4rem; margin: 0.6rem 0; background: var(--surface); overflow: hidden; }
	.embed-head {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		padding: 0.45rem 0.7rem;
		background: none;
		border: 0;
		text-align: left;
		font: inherit;
		font-weight: 600;
		color: inherit;
	}
	.embed-head :global(.chev) { flex: none; color: var(--muted); transition: transform 0.12s ease; }
	.embed.collapsed .embed-head :global(.chev) { transform: rotate(-90deg); }
	.embed-title { flex: 1; min-width: 0; }
	.embed-more { flex: none; font-weight: 400; font-size: 0.78rem; color: var(--accent); }
	.embed-body { padding: 0 0.8rem 0.5rem; }
	.note { color: var(--muted); font-size: 0.85rem; margin: 0.3rem 0; }

	@media print {
		.step, .embed { break-inside: avoid; }
		.pill { border: 1px solid #999; background: none; }
		/* always print sub-recipes in full, even if collapsed on screen */
		.embed-body[hidden] { display: block !important; }
		.embed-head :global(.chev), .embed-more { display: none; }
		.embed.collapsed .embed-body { padding-top: 0.4rem; }
	}
</style>
