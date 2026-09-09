<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Recipes</title></svelte:head>

<div class="rec-topbar">
	<a class="rec-link" href="/">‹ List</a>
	<strong>Recipes</strong>
	<span class="spacer"></span>
	<a class="rec-btn" href="/recipes/import">Import</a>
	<a class="rec-btn primary" href="/recipes/new">New recipe</a>
</div>

{#if !data.recipes.length}
	<p class="empty">No recipes yet. Add one, or import from a photo or a link.</p>
{:else}
	<ul class="list">
		{#each data.recipes as r (r.id)}
			<li>
				<a href={`/recipes/${r.id}`}>
					<span class="name">{r.title}</span>
					{#if r.servings}<span class="serves">{r.servings}</span>{/if}
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		color: var(--muted);
		padding: 1rem 0;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		border-bottom: 1px solid var(--line);
	}
	.list a {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.7rem 0.2rem;
		text-decoration: none;
		color: inherit;
	}
	.name {
		font-size: 1.05rem;
	}
	.serves {
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>
