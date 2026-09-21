<script lang="ts">
	import Screen from '$lib/nav/Screen.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Prep day</title></svelte:head>

<Screen title="Prep day" back="/recipes">
	{#if form?.items}
		<p class="ok">Confirm what you need — untick anything you already have.</p>
		<form method="POST" action="?/addToList" class="list">
			{#each form.items as it (it.name)}
				<label class="row">
					<input type="checkbox" name="name" value={it.name} checked />
					<span>{it.name}</span>
					{#if it.item_id}<span class="badge">in your items</span>{/if}
				</label>
			{/each}
			<button class="btn btn-sm btn-primary">Add missing to the list</button>
		</form>
	{:else}
		{#if form?.error}<p class="err">{form.error}</p>{/if}
		<p class="hint">Pick the recipes you're batch-cooking this weekend.</p>
		<form method="POST" action="?/ingredients" class="list">
			{#each data.recipes as r (r.id)}
				<label class="row">
					<input type="checkbox" name="recipeId" value={r.id} />
					<span>{r.title}</span>
				</label>
			{/each}
			{#if !data.recipes.length}
				<p class="hint">
					No recipes are marked as prep recipes yet — open a recipe's editor and check "Weekend
					batch-prep recipe".
				</p>
			{/if}
			<button class="btn btn-sm btn-primary" disabled={!data.recipes.length}>
				Check ingredients
			</button>
		</form>
	{/if}
</Screen>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0.6rem 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
	}
	.badge {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--text-2);
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}
	.hint {
		color: var(--text-2);
		font-size: 0.88rem;
	}
	.ok {
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.err {
		color: var(--danger);
		font-size: 0.85rem;
	}
</style>
