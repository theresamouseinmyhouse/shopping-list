<script lang="ts">
	import { ui, currentRows, mutate, keys } from '$lib/client/store.svelte';
	import { buildView } from '$lib/client/view';
	import Screen from '$lib/nav/Screen.svelte';
	import Sheet from '$lib/nav/Sheet.svelte';
	import { sortable, type SortableMove } from '$lib/client/sortable';
	import Plus from '@lucide/svelte/icons/plus';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { uuid } from '$lib/client/uuid';

	const rows = $derived.by(() => {
		ui.rev;
		return currentRows();
	});
	const view = $derived(buildView(rows, ''));
	const countFor = (id: string) =>
		view.groups.find((g) => g.place?.id === id)?.items.length ?? 0;

	let adding = $state(false);
	let newName = $state('');
	function addStore() {
		const n = newName.trim();
		if (!n) return;
		const last = view.places.at(-1)?.position ?? null;
		mutate({ type: 'add_place', place_id: uuid(), name: n, position: keys.after(last) });
		newName = '';
		adding = false;
	}

	let editId = $state<string | null>(null);
	const editing = $derived(view.places.find((p) => p.id === editId) ?? null);
	let editName = $state('');
	$effect(() => {
		if (editing) editName = editing.name;
	});
	function saveStore() {
		if (editing && editName.trim() && editName.trim() !== editing.name)
			mutate({ type: 'rename_place', place_id: editing.id, name: editName.trim() });
		editId = null;
	}
	function deleteStore() {
		if (editing && confirm(`Delete “${editing.name}”? Items stay on the list.`))
			mutate({ type: 'delete_place', place_id: editing.id });
		editId = null;
	}

	function onMove(m: SortableMove) {
		const pos = (id: string | undefined) =>
			id ? rows.places.get(id)?.position ?? null : null;
		mutate({
			type: 'move_place',
			place_id: m.itemId,
			position: keys.between(pos(m.toOrder[m.newIndex - 1]), pos(m.toOrder[m.newIndex + 1]))
		});
	}
</script>

<svelte:head><title>Stores</title></svelte:head>

<Screen title="Stores">
	{#snippet actions()}
		<button class="btn btn-tinted btn-sm" aria-label="Add store" onclick={() => (adding = true)}>
			<Plus size={18} /> Add
		</button>
	{/snippet}

	{#if !view.places.length}
		<p class="empty">No stores yet — add the places you shop.</p>
	{/if}

	<ul
		class="group"
		data-zone="__stores__"
		use:sortable={{ group: 'stores', zone: '__stores__', handle: '.store-handle', onMove }}
	>
		{#each view.places as p (p.id)}
			<li class="row store-row" data-id={p.id}>
				<span class="store-handle" aria-hidden="true"><GripVertical size={18} /></span>
				<a class="grow" href={`/stores/${p.id}`}>
					<span class="nm">{p.name}</span>
					<span class="ct">{countFor(p.id)}</span>
				</a>
				<button class="more" aria-label={`Edit ${p.name}`} onclick={() => (editId = p.id)}>
					<MoreHorizontal size={18} />
				</button>
				<a class="chev" href={`/stores/${p.id}`} aria-hidden="true" tabindex="-1"
					><ChevronRight size={20} /></a
				>
			</li>
		{/each}
	</ul>
</Screen>

<Sheet open={adding} onClose={() => (adding = false)} title="Add store">
	<input
		class="field"
		bind:value={newName}
		placeholder="Store name"
		onkeydown={(e) => e.key === 'Enter' && addStore()}
	/>
	{#snippet foot()}
		<span style="flex:1"></span>
		<button class="btn" onclick={() => (adding = false)}>Cancel</button>
		<button class="btn btn-primary" onclick={addStore}>Add</button>
	{/snippet}
</Sheet>

<Sheet open={editId !== null} onClose={() => (editId = null)} title={editing?.name ?? 'Store'}>
	{#if editing}
		<input
			class="field"
			bind:value={editName}
			placeholder="Store name"
			onkeydown={(e) => e.key === 'Enter' && saveStore()}
		/>
	{/if}
	{#snippet foot()}
		<button class="btn btn-danger" onclick={deleteStore}>Delete</button>
		<span style="flex:1"></span>
		<button class="btn" onclick={() => (editId = null)}>Cancel</button>
		<button class="btn btn-primary" onclick={saveStore}>Save</button>
	{/snippet}
</Sheet>

<style>
	.empty {
		padding: 1.5rem 0.7rem;
		color: var(--text-2);
		text-align: center;
	}
	.group {
		list-style: none;
		margin: 0 0.7rem;
		padding: 0;
	}
	.store-row {
		display: flex;
		align-items: center;
	}
	.store-handle {
		display: grid;
		place-items: center;
		color: var(--text-3);
		padding: 0.6rem 0.15rem 0.6rem 0;
		touch-action: none;
		cursor: grab;
	}
	.grow {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		text-decoration: none;
		color: var(--text);
		min-width: 0;
	}
	.nm {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ct {
		flex: none;
		font-size: var(--fs-sub);
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
	}
	.more {
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		background: none;
		border: 0;
		color: var(--text-2);
	}
	.chev {
		display: grid;
		place-items: center;
		color: var(--text-3);
	}
</style>
