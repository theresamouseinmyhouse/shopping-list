<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ui, currentRows, mutate, keys } from '$lib/client/store.svelte';
	import { buildView } from '$lib/client/view';
	import { resolvePlacement } from '$lib/client/rows';
	import { sortable, type SortableMove } from '$lib/client/sortable';
	import Screen from '$lib/nav/Screen.svelte';
	import Sheet from '$lib/nav/Sheet.svelte';
	import ItemRow from '$lib/client/ItemRow.svelte';
	import ItemOptionsSheet from '$lib/client/ItemOptionsSheet.svelte';
	import AddItemBox from '$lib/client/AddItemBox.svelte';
	import type { ItemView } from '$lib/client/view';
	import { uuid } from '$lib/client/uuid';
	import { parseAdd, singularizeName } from '$lib/quantity';

	const id = $derived(page.params.id ?? '');
	const rows = $derived.by(() => {
		ui.rev;
		return currentRows();
	});
	const store = $derived(rows.places.get(id));
	$effect(() => {
		if (ui.booted && !store) goto('/stores', { replaceState: true });
	});
	const view = $derived(buildView(rows, id));

	const suggestions = $derived(
		[...rows.items.values()]
			.filter((i) => !i.deleted_at)
			.map((i) => ({ name: i.name, on_list: !!rows.listState.get(i.id)?.on_list }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	let optionsFor = $state<ItemView | null>(null);
	let editing = $state(false);
	let editName = $state('');
	$effect(() => {
		if (store) editName = store.name;
	});

	function addItem(raw: string) {
		const { qty, name: parsed } = parseAdd(raw);
		const n = (qty != null ? singularizeName(parsed) : parsed).trim();
		if (!n) return;
		mutate({
			type: 'add_item',
			item_id: uuid(),
			name: n,
			position: keys.before(view.items[0]?.position ?? null),
			scope_place_id: id,
			qty: qty ?? 1
		});
	}
	function onItemMove(m: SortableMove) {
		const pos = (x: string | undefined) => (x ? resolvePlacement(rows, x, id).position : null);
		mutate({
			type: 'move_item',
			item_id: m.itemId,
			scope_place_id: id,
			position: keys.between(pos(m.toOrder[m.newIndex - 1]), pos(m.toOrder[m.newIndex + 1]))
		});
	}
	function saveStore() {
		if (store && editName.trim() && editName.trim() !== store.name)
			mutate({ type: 'rename_place', place_id: id, name: editName.trim() });
		editing = false;
	}
	function deleteStore() {
		if (store && confirm(`Delete “${store.name}”? Items stay on the list.`)) {
			mutate({ type: 'delete_place', place_id: id });
			goto('/stores', { replaceState: true });
		}
	}
</script>

<svelte:head><title>{store?.name ?? 'Store'}</title></svelte:head>

<Screen title={store?.name ?? 'Store'} back="/stores">
	{#snippet actions()}
		<button class="btn btn-plain" onclick={() => (editing = true)}>Edit</button>
	{/snippet}

	<div class="page">
	<ul
		class="list"
		data-zone={id}
		use:sortable={{ group: 'items', zone: id, handle: '.item-handle', onMove: onItemMove }}
	>
		{#each view.items as it (it.id)}
			<ItemRow
				item={it}
				place={id}
				scopeName={store?.name ?? ''}
				onOptions={(x) => (optionsFor = x)}
			/>
		{/each}
	</ul>

	{#if view.hidden.length}
		<section class="extra">
			<h2 class="caption">Not carried here ({view.hidden.length})</h2>
			<ul>
				{#each view.hidden as it (it.id)}<ItemRow
						item={it}
						place={id}
						scopeName={store?.name ?? ''}
						onOptions={(x) => (optionsFor = x)}
					/>{/each}
			</ul>
		</section>
	{/if}
	{#if view.checked.length}
		<section class="extra">
			<h2 class="caption">
				Checked ({view.checked.length})<span class="grow"></span>
				<button class="btn btn-plain" onclick={() => mutate({ type: 'clear_checked' })}>Clear</button>
			</h2>
			<ul>
				{#each view.checked as it (it.id)}<ItemRow
						item={it}
						place={id}
						scopeName={store?.name ?? ''}
						onOptions={(x) => (optionsFor = x)}
					/>{/each}
			</ul>
		</section>
	{/if}

	<ItemOptionsSheet
		item={optionsFor}
		place={id}
		scopeName={store?.name ?? ''}
		onClose={() => (optionsFor = null)}
	/>
	</div>
</Screen>

<Sheet open={editing} onClose={() => (editing = false)} title={store?.name ?? 'Store'}>
	<input class="field" bind:value={editName} onkeydown={(e) => e.key === 'Enter' && saveStore()} />
	{#snippet foot()}
		<button class="btn btn-danger" onclick={deleteStore}>Delete</button>
		<span style="flex:1"></span>
		<button class="btn" onclick={() => (editing = false)}>Cancel</button>
		<button class="btn btn-primary" onclick={saveStore}>Save</button>
	{/snippet}
</Sheet>

<footer class="quickadd">
	<AddItemBox
		{suggestions}
		boxed
		dropUp
		placeholder={`Add to ${store?.name ?? 'store'}…`}
		onAdd={addItem}
	/>
</footer>

<style>
	.page {
		padding-bottom: calc(var(--tabbar-h) + var(--safe-b) + 4rem);
	}
	.list,
	.extra ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.extra h2 {
		display: flex;
		align-items: center;
		margin: 0;
		padding: 0.7rem 0.7rem 0.3rem;
	}
	.extra .grow {
		flex: 1;
	}
	.quickadd {
		position: fixed;
		left: 0;
		right: 0;
		bottom: calc(var(--tabbar-h) + var(--safe-b) + var(--kb, 0px));
		z-index: 15;
		padding: 0.5rem 0.7rem;
		background: var(--surface-1);
		border-top: 1px solid var(--line);
	}
</style>
