<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import RecipeBody from '../../RecipeBody.svelte';
	import { normalizeName } from '$lib/types';
	let { data, form } = $props();
	const tree = $derived(data.tree);

	let picking = $state(false);
	// which candidate names are ticked (all on by default)
	let chosen = $state(
		new Set(untrack(() => data.candidates).map((c) => normalizeName(c.name)))
	);
	const count = $derived(chosen.size);

	function toggle(name: string) {
		const k = normalizeName(name);
		chosen.has(k) ? chosen.delete(k) : chosen.add(k);
		chosen = new Set(chosen);
	}
	function all(on: boolean) {
		chosen = on ? new Set(data.candidates.map((c) => normalizeName(c.name))) : new Set();
	}
</script>

<svelte:head><title>{tree.title}</title></svelte:head>

<div class="rec-topbar noprint">
	<a class="rec-link" href="/recipes">‹ Recipes</a>
	<span class="spacer"></span>
	<a class="rec-btn" href={`/recipes/${tree.id}/edit`}>Edit</a>
	<button class="rec-btn" onclick={() => window.print()}>Print</button>
	<button
		class="rec-btn primary"
		onclick={() => (picking = !picking)}
		disabled={!data.candidates.length}
	>
		Add to list
	</button>
	<form
		method="POST"
		action="?/delete"
		style="display:contents"
		onsubmit={(e) => {
			if (!confirm(`Delete “${tree.title}”?`)) e.preventDefault();
		}}
	>
		<button class="rec-btn danger">Delete</button>
	</form>
</div>

{#if picking}
	<form
		method="POST"
		action="?/addToList"
		class="picker noprint"
		use:enhance={() =>
			({ update }) => {
				picking = false;
				return update({ reset: false });
			}}
	>
		<div class="pickhead">
			<strong>Add to shopping list</strong>
			<span class="spacer"></span>
			<button type="button" class="link" onclick={() => all(true)}>all</button>
			<button type="button" class="link" onclick={() => all(false)}>none</button>
		</div>
		<p class="hint">Untick what you already have.</p>
		<ul>
			{#each data.candidates as c (c.name)}
				<li>
					<label>
						<input
							type="checkbox"
							name="name"
							value={c.name}
							checked={chosen.has(normalizeName(c.name))}
							onchange={() => toggle(c.name)}
						/>
						{c.name}
						{#if c.item_id}<span class="known">in your items</span>{/if}
					</label>
				</li>
			{/each}
		</ul>
		<div class="pickactions">
			<button type="button" class="rec-btn" onclick={() => (picking = false)}>Cancel</button>
			<button class="rec-btn primary" disabled={count === 0}>
				Add {count} item{count === 1 ? '' : 's'}
			</button>
		</div>
	</form>
{/if}

{#if form?.added != null}
	<p class="flash noprint">
		{#if form.added}Added {form.added} item{form.added === 1 ? '' : 's'} to your list.{:else}Nothing selected.{/if}
	</p>
{/if}

{#if tree.source_url}
	<p class="src noprint"><a href={tree.source_url} target="_blank" rel="noreferrer">source</a></p>
{/if}

<article>
	<RecipeBody recipe={tree} />
</article>

<style>
	.picker {
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		padding: 0.7rem;
		margin: 0.5rem 0;
	}
	.pickhead {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.spacer {
		flex: 1;
	}
	.link {
		background: none;
		border: 0;
		color: var(--accent);
		font-size: 0.85rem;
	}
	.hint {
		margin: 0.2rem 0 0.5rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.picker ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.picker label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.2rem;
		font-size: 0.92rem;
	}
	.known {
		font-size: 0.72rem;
		color: var(--muted);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0 0.4rem;
	}
	.pickactions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.pickactions .primary {
		flex: 1;
	}
	.flash {
		background: var(--surface-2);
		border-radius: 0.5rem;
		padding: 0.5rem 0.7rem;
		font-size: 0.9rem;
		margin: 0.4rem 0;
	}
	.src {
		font-size: 0.8rem;
		margin: 0.2rem 0;
	}
	@media print {
		.noprint {
			display: none !important;
		}
	}
</style>
