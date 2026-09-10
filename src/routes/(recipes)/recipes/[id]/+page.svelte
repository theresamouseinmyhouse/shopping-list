<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Screen from '$lib/nav/Screen.svelte';
	import Sheet from '$lib/nav/Sheet.svelte';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import RecipeBody from '../../RecipeBody.svelte';
	import { normalizeName } from '$lib/types';
	import { parseQuantity, factorFromHave, formatQuantity } from '$lib/scale';
	import { formatAmount } from '$lib/units';
	let { data, form } = $props();
	const tree = $derived(data.tree);

	// ---- serving scaler (display only) -------------------------------------
	let scale = $state(1);
	let haveOpen = $state(false);
	let haveId = $state('');
	let haveAmt = $state('');
	const PRESETS = [0.5, 1, 1.5, 2, 3];

	// ingredients with a numeric quantity, for "scale to what I have"
	const scalable = $derived(
		tree.ingredients.filter((i) => parseQuantity(i.quantity))
	);
	function applyHave() {
		const ing = scalable.find((i) => i.id === haveId);
		const n = Number(haveAmt);
		if (!ing || !n) return;
		const f = factorFromHave(ing.quantity, n);
		if (f && f > 0) {
			scale = Math.round(f * 1000) / 1000;
			haveOpen = false;
		}
	}

	let picking = $state(false);
	let menuOpen = $state(false);
	let deleting = $state(false);

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

<Screen title={tree.title} back="/recipes">
	{#snippet actions()}
		<button
			class="btn btn-sm btn-primary"
			onclick={() => (picking = true)}
			disabled={!data.candidates.length}
		>
			Add to list
		</button>
		<button class="btn btn-sm" aria-label="More" onclick={() => (menuOpen = true)}>
			<MoreHorizontal size={18} />
		</button>
	{/snippet}

	{#if form?.added != null}
		<p class="flash noprint">
			{#if form.added}Added {form.added} item{form.added === 1 ? '' : 's'} to your list.{:else}Nothing selected.{/if}
		</p>
	{/if}

	{#if tree.source_url}
		<p class="src noprint"><a href={tree.source_url} target="_blank" rel="noreferrer">source</a></p>
	{/if}

	<div class="scalebar noprint">
		<span class="lbl">Scale</span>
		{#each PRESETS as p (p)}
			<button class="sc" class:on={scale === p} onclick={() => (scale = p)}>
				{p === 1 ? '1×' : `${formatQuantity(p)}×`}
			</button>
		{/each}
		<button class="sc" class:on={haveOpen} onclick={() => (haveOpen = true)}>to what I have…</button>
		{#if scale !== 1 && !PRESETS.includes(scale)}
			<span class="cur">×{formatQuantity(scale)}</span>
			<button class="sc" onclick={() => (scale = 1)}>reset</button>
		{/if}
	</div>

	<article>
		<RecipeBody recipe={tree} {scale} />
	</article>
</Screen>

<!-- Add to list -->
<Sheet open={picking} onClose={() => (picking = false)} title="Add to list">
	<form
		method="POST"
		action="?/addToList"
		class="picker"
		use:enhance={() =>
			({ update }) => {
				picking = false;
				return update({ reset: false });
			}}
	>
		<div class="pickhead">
			<span class="hint">Untick what you already have.</span>
			<span class="spacer"></span>
			<button type="button" class="btn btn-plain btn-sm" onclick={() => all(true)}>all</button>
			<button type="button" class="btn btn-plain btn-sm" onclick={() => all(false)}>none</button>
		</div>
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
		<button class="btn btn-primary" type="submit" disabled={count === 0}>
			Add {count} item{count === 1 ? '' : 's'}
		</button>
	</form>
	{#snippet foot()}
		<button class="btn" type="button" onclick={() => (picking = false)}>Cancel</button>
	{/snippet}
</Sheet>

<!-- Scale to what I have -->
<Sheet open={haveOpen} onClose={() => (haveOpen = false)} title="Scale to what I have">
	<p class="hint">Pick an ingredient and say how much you have — everything scales to match.</p>
	<select class="field" bind:value={haveId}>
		<option value="">ingredient…</option>
		{#each scalable as i (i.id)}
			<option value={i.id}>{formatAmount(i.quantity, i.unit)} {i.name}</option>
		{/each}
	</select>
	<input class="field" type="number" min="0" step="any" bind:value={haveAmt} placeholder="0" />
	<button class="btn btn-primary" onclick={applyHave} disabled={!haveId || !Number(haveAmt)}>Apply</button>
	<p class="hint dim">Rough guide only — spices, salt and leavening often need a human eye.</p>
	{#snippet foot()}
		<button class="btn" type="button" onclick={() => (haveOpen = false)}>Cancel</button>
	{/snippet}
</Sheet>

<!-- ⋯ menu -->
<Sheet open={menuOpen} onClose={() => (menuOpen = false)} title={tree.title}>
	<a class="btn" href={`/recipes/${tree.id}/edit`}>Edit</a>
	<button class="btn" onclick={() => { menuOpen = false; window.print(); }}>Print</button>
	<button class="btn btn-danger" onclick={() => { menuOpen = false; deleting = true; }}>Delete</button>
</Sheet>

<!-- Delete confirm -->
<Sheet open={deleting} onClose={() => (deleting = false)} title={`Delete ${tree.title}?`}>
	<p class="hint">This can't be undone.</p>
	<form method="POST" action="?/delete">
		<button class="btn btn-danger" type="submit">Delete</button>
	</form>
	{#snippet foot()}
		<button class="btn" type="button" onclick={() => (deleting = false)}>Cancel</button>
	{/snippet}
</Sheet>

<style>
	.spacer {
		flex: 1;
	}
	.hint {
		margin: 0.2rem 0 0.5rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.pickhead {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
	.picker button[type='submit'] {
		width: 100%;
		margin-top: 0.6rem;
	}
	.known {
		font-size: 0.72rem;
		color: var(--muted);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0 0.4rem;
	}
	.flash {
		background: var(--surface-2);
		border-radius: 0.5rem;
		padding: 0.5rem 0.7rem;
		font-size: 0.9rem;
		margin: 0.4rem 0.7rem;
	}
	.src {
		font-size: 0.8rem;
		margin: 0.2rem 0.7rem;
	}
	.scalebar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		margin: 0.5rem 0 0.2rem;
		padding: 0 0.7rem;
	}
	.scalebar .lbl {
		font-size: 0.8rem;
		color: var(--muted);
		margin-right: 0.1rem;
	}
	.sc {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		padding: 0.25rem 0.55rem;
		font-size: 0.85rem;
		color: inherit;
	}
	.sc.on {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.cur {
		font-size: 0.85rem;
		color: var(--accent);
		font-weight: 600;
	}
	.hint.dim {
		opacity: 0.8;
		margin-top: 0.4rem;
	}
	article {
		padding: 0 0.7rem;
	}
	@media print {
		.noprint {
			display: none !important;
		}
		article {
			padding: 0;
		}
	}
</style>
