<script lang="ts">
	import Screen from '$lib/nav/Screen.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Recipes</title></svelte:head>

<Screen title="Recipes">
	{#snippet actions()}
		<a class="btn btn-sm" href="/recipes/import">Import</a>
		<a class="btn btn-sm btn-primary" href="/recipes/new">New</a>
	{/snippet}

	{#if !data.recipes.length}
		<p class="empty">No recipes yet. Add one, or import from a photo or a link.</p>
	{:else}
		<div class="group">
			{#each data.recipes as r (r.id)}
				<a class="row" href={`/recipes/${r.id}`}>
					<span class="name">{r.title}</span>
					<span class="spacer"></span>
					{#if r.servings}<span class="serves">{r.servings}</span>{/if}
				</a>
			{/each}
		</div>
	{/if}
</Screen>

<style>
	.empty {
		color: var(--text-2);
		padding: 1rem 0.7rem;
	}
	.row {
		text-decoration: none;
		color: inherit;
	}
	.spacer {
		flex: 1;
	}
	.name {
		font-size: 1.05rem;
	}
	.serves {
		font-size: 0.8rem;
		color: var(--text-2);
	}
</style>
