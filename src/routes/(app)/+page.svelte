<script lang="ts">
	import { ui, currentRows, mutate, setPlace, keys } from '$lib/client/store.svelte';
	import { buildView } from '$lib/client/view';
	import { resolvePlacement } from '$lib/client/rows';
	import { sortable, type SortableMove } from '$lib/client/sortable';
	import ItemRow from '$lib/client/ItemRow.svelte';
	import AddItemBox from '$lib/client/AddItemBox.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { uuid } from '$lib/client/uuid';
	import { parseAdd, singularizeName } from '$lib/quantity';
	import { GLOBAL } from '$lib/types';

	const rows = $derived.by(() => {
		ui.rev;
		return currentRows();
	});
	const view = $derived(buildView(rows, ui.place));
	const placeSelected = $derived(ui.place !== GLOBAL);
	const placeNameOf = (id: string) => rows.places.get(id)?.name ?? '';
	const stores = $derived(view.groups.filter((g) => g.place));
	const loose = $derived(view.groups.find((g) => !g.place) ?? { place: null, items: [] });

	const suggestions = $derived(
		[...rows.items.values()]
			.filter((i) => !i.deleted_at)
			.map((i) => ({ name: i.name, on_list: !!rows.listState.get(i.id)?.on_list }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	let editingPlace = $state(false);
	let placeName = $state('');

	// collapsed store groups in the All view — remembered per device
	let collapsed = $state<Record<string, boolean>>({});
	try {
		collapsed = JSON.parse(localStorage.getItem('list.collapsed') || '{}');
	} catch {
		/* private mode / bad json */
	}
	function toggleCollapsed(key: string) {
		collapsed[key] = !collapsed[key];
		try {
			localStorage.setItem('list.collapsed', JSON.stringify(collapsed));
		} catch {
			/* ignore */
		}
	}

	function addItem(raw: string) {
		const { qty, name: parsed } = parseAdd(raw);
		const n = (qty != null ? singularizeName(parsed) : parsed).trim();
		if (!n) return;
		// new items go to the top of the relevant list so you notice and place them
		const top = (placeSelected ? view.items : loose.items)[0]?.position ?? null;
		mutate({
			type: 'add_item',
			item_id: uuid(),
			name: n,
			position: keys.before(top),
			scope_place_id: ui.place,
			qty: qty ?? 1
		});
	}

	function onItemMove(m: SortableMove) {
		const scope = m.toZone;
		const pos = (id: string | undefined) =>
			id ? resolvePlacement(rows, id, scope).position : null;
		const position = keys.between(pos(m.toOrder[m.newIndex - 1]), pos(m.toOrder[m.newIndex + 1]));
		if (m.toZone !== m.fromZone) {
			// dragged into another store's group (or "Not sorted yet") — that becomes its home store
			mutate({ type: 'set_item_scope', item_id: m.itemId, scope_place_id: m.toZone });
		}
		mutate({ type: 'move_item', item_id: m.itemId, scope_place_id: m.toZone, position });
	}

	function onPlaceMove(m: SortableMove) {
		const pos = (id: string | undefined) => (id ? rows.places.get(id)?.position ?? null : null);
		mutate({
			type: 'move_place',
			place_id: m.itemId,
			position: keys.between(pos(m.toOrder[m.newIndex - 1]), pos(m.toOrder[m.newIndex + 1]))
		});
	}

	function savePlace() {
		const n = placeName.trim();
		if (n) mutate({ type: 'rename_place', place_id: ui.place, name: n });
		editingPlace = false;
	}
	function deletePlace() {
		if (confirm('Delete this store? Items stay on the list.')) {
			mutate({ type: 'delete_place', place_id: ui.place });
			setPlace(GLOBAL);
			editingPlace = false;
		}
	}
	function addPlace() {
		const name = prompt('New store name')?.trim();
		if (!name) return;
		const last = view.places.at(-1)?.position ?? null;
		const id = uuid();
		mutate({ type: 'add_place', place_id: id, name, position: keys.after(last) });
		setPlace(id);
	}
</script>

<svelte:head><title>List</title></svelte:head>

<header>
	<div class="topbar">
		<strong>List</strong>
		<nav>
			<a class="link" href="/catalog">Items</a>
			<a class="link" href="/recipes">Recipes</a>
		</nav>
	</div>
	<div class="chips">
		<button class="chip" class:on={ui.place === GLOBAL} onclick={() => setPlace(GLOBAL)}>All</button>
		{#each view.places as p (p.id)}
			<button class="chip" class:on={ui.place === p.id} onclick={() => setPlace(p.id)}>{p.name}</button>
		{/each}
		<button class="chip add" onclick={addPlace} aria-label="Add store"><Plus size={16} /></button>
	</div>
	{#if placeSelected}
		<div class="placebar">
			{#if editingPlace}
				<input bind:value={placeName} placeholder="Store name" onkeydown={(e) => e.key === 'Enter' && savePlace()} />
				<button onclick={savePlace}>Save</button>
				<button class="danger" onclick={deletePlace}>Delete</button>
			{:else}
				<button
					class="link"
					onclick={() => {
						placeName = view.places.find((p) => p.id === ui.place)?.name ?? '';
						editingPlace = true;
					}}>Edit store</button
				>
			{/if}
		</div>
	{/if}
</header>

<main>
	{#if !view.places.length && !view.items.length && !loose.items.length && !view.checked.length}
		<div class="firstrun">
			<p>Add an item below to get started. Add the stores you shop at with <strong>+</strong>, then drag items into the order you walk each store.</p>
			<button onclick={addPlace}>+ Add a store</button>
		</div>
	{/if}

	{#if placeSelected}
		<ul
			class="list"
			data-zone={ui.place}
			use:sortable={{ group: 'items', zone: ui.place, handle: '.item-handle', onMove: onItemMove }}
		>
			{#each view.items as it (it.id)}
				<ItemRow item={it} place={ui.place} scopeName={placeNameOf(it.scope_place_id)} />
			{/each}
		</ul>
	{:else}
		<ul
			class="groups"
			use:sortable={{ group: 'places', zone: '__places__', handle: '.place-handle', onMove: onPlaceMove }}
		>
			{#each stores as g (g.place!.id)}
				<li class="group" data-id={g.place!.id}>
					<div class="ghead">
						<span class="place-handle" aria-hidden="true"><GripVertical size={18} /></span>
						<button class="gname" onclick={() => setPlace(g.place!.id)}>{g.place!.name}</button>
						<span class="gcount">{g.items.length}</span>
						<button
							class="gcollapse"
							class:closed={collapsed[g.place!.id]}
							aria-label="Collapse {g.place!.name}"
							onclick={() => toggleCollapsed(g.place!.id)}
						>
							<ChevronDown size={18} />
						</button>
					</div>
					{#if !collapsed[g.place!.id]}
						<ul
							class="list"
							data-zone={g.place!.id}
							use:sortable={{ group: 'items', zone: g.place!.id, handle: '.item-handle', onMove: onItemMove }}
						>
							{#each g.items as it (it.id)}
								<ItemRow item={it} place={GLOBAL} scopeName={g.place!.name} />
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="group loose">
			<div class="ghead">
				<span class="place-handle spacer" aria-hidden="true"></span>
				<span class="gname plain">Not sorted yet</span>
				<span class="gcount">{loose.items.length}</span>
				<button
					class="gcollapse"
					class:closed={collapsed['__loose__']}
					aria-label="Collapse not sorted yet"
					onclick={() => toggleCollapsed('__loose__')}
				>
					<ChevronDown size={18} />
				</button>
			</div>
			{#if !collapsed['__loose__']}
				<ul
					class="list"
					data-zone={GLOBAL}
					use:sortable={{ group: 'items', zone: GLOBAL, handle: '.item-handle', onMove: onItemMove }}
				>
					{#each loose.items as it (it.id)}
						<ItemRow item={it} place={GLOBAL} scopeName={placeNameOf(it.scope_place_id)} />
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if view.hidden.length}
		<section class="extra">
			<h2>Not carried here ({view.hidden.length})</h2>
			<ul>
				{#each view.hidden as it (it.id)}<ItemRow item={it} place={ui.place} scopeName={placeNameOf(it.scope_place_id)} />{/each}
			</ul>
		</section>
	{/if}

	{#if view.checked.length}
		<section class="extra">
			<h2>
				Checked ({view.checked.length})
				<span class="grow"></span>
				<button class="link" onclick={() => mutate({ type: 'clear_checked' })}>Clear</button>
			</h2>
			<ul>
				{#each view.checked as it (it.id)}<ItemRow item={it} place={ui.place} scopeName={placeNameOf(it.scope_place_id)} />{/each}
			</ul>
		</section>
	{/if}
</main>

<footer class="quickadd">
	<AddItemBox {suggestions} boxed dropUp placeholder="Add item…" onAdd={addItem} />
</footer>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.7rem 0.1rem;
	}
	.topbar strong {
		font-size: 0.95rem;
	}
	.topbar nav {
		display: flex;
		gap: 0.9rem;
	}
	.link {
		background: none;
		border: 0;
		color: var(--accent);
		font-size: 0.9rem;
		text-decoration: none;
		padding: 0.2rem;
	}
	.chips {
		display: flex;
		gap: 0.4rem;
		padding: 0.5rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.chip {
		flex: none;
		padding: 0.45rem 0.85rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		font-size: 0.9rem;
		white-space: nowrap;
	}
	.chip.on {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	.chip.add {
		display: inline-grid;
		place-items: center;
		padding: 0.45rem 0.6rem;
	}
	.placebar {
		display: flex;
		gap: 0.5rem;
		padding: 0 0.5rem 0.5rem;
		align-items: center;
	}
	.placebar input {
		flex: 1;
		padding: 0.4rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
		color: inherit;
	}
	.danger {
		background: none;
		border: 0;
		color: var(--danger);
	}
	main {
		padding-bottom: 4.5rem;
	}
	.firstrun {
		padding: 1.5rem 1rem;
		text-align: center;
		color: var(--muted);
	}
	.firstrun button {
		margin-top: 0.5rem;
		padding: 0.6rem 1rem;
		border: 0;
		border-radius: 0.6rem;
		background: var(--accent);
		color: #fff;
		font-weight: 600;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.groups {
		display: flex;
		flex-direction: column;
	}
	.group {
		border-bottom: 1px solid var(--line);
	}
	.ghead {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.35rem 0.4rem 0.35rem 0.2rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--line);
		position: sticky;
		top: 0;
		z-index: 5;
	}
	.place-handle {
		flex: none;
		display: grid;
		place-items: center;
		align-self: stretch;
		min-width: 2.75rem;
		cursor: grab;
		touch-action: none;
		padding: 0.6rem 0.5rem;
		color: var(--muted);
	}
	.place-handle.spacer {
		min-width: 2.75rem;
		cursor: default;
	}
	.gname {
		flex: 1;
		text-align: left;
		background: none;
		border: 0;
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--muted);
		padding: 0.3rem 0.2rem;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.gname.plain {
		cursor: default;
	}
	.gcount {
		flex: none;
		font-size: 0.8rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		padding: 0 0.2rem;
	}
	.gcollapse {
		flex: none;
		display: grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		background: none;
		border: 0;
		color: var(--muted);
	}
	.gcollapse.closed {
		transform: rotate(-90deg);
	}
	.extra {
		opacity: 0.9;
	}
	.extra h2 {
		display: flex;
		align-items: center;
		margin: 0;
		padding: 0.7rem 0.6rem 0.3rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.grow {
		flex: 1;
	}
	.quickadd {
		position: fixed;
		bottom: var(--kb, 0px);
		left: 0;
		right: 0;
		z-index: 15;
		padding: 0.5rem 0.7rem;
		padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
		background: var(--surface);
		border-top: 1px solid var(--line);
	}
</style>
