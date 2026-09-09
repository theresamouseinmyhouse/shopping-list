<script lang="ts">
	import { displayAmount, type ResolvedRecipe, type ResolvedChild, type ResolvedIngredient } from '$lib/recipe';
	import Self from './RecipeBody.svelte';

	let { recipe, embedded = false }: { recipe: ResolvedRecipe; embedded?: boolean } = $props();

	function amount(i: ResolvedIngredient) {
		const { main, alt } = displayAmount(i);
		return alt ? `${main} (${alt})` : main;
	}

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
		<div class="embed"><Self recipe={c.recipe} embedded /></div>
	{:else if c.kind === 'cycle'}
		<p class="note">↻ see “{c.title}” above</p>
	{:else}
		<p class="note">· “{c.title}” (no such recipe)</p>
	{/if}
{/snippet}

<svelte:element this={embedded ? 'h3' : 'h1'} class="title">{recipe.title}</svelte:element>
{#if recipe.servings}<p class="meta">Serves {recipe.servings}</p>{/if}
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
	.embed { border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 0.4rem; padding: 0.5rem 0.8rem; margin: 0.6rem 0; background: var(--surface); }
	.note { color: var(--muted); font-size: 0.85rem; margin: 0.3rem 0; }

	@media print {
		.step, .embed { break-inside: avoid; }
		.pill { border: 1px solid #999; background: none; }
	}
</style>
