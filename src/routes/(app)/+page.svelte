<script lang="ts">
	import { ui, currentRows, mutate, keys } from '$lib/client/store.svelte';
	import { buildView } from '$lib/client/view';
	import type { ItemView } from '$lib/client/view';
	import { resolvePlacement } from '$lib/client/rows';
	import { sortable, type SortableMove } from '$lib/client/sortable';
	import Screen from '$lib/nav/Screen.svelte';
	import ItemRow from '$lib/client/ItemRow.svelte';
	import ItemOptionsSheet from '$lib/client/ItemOptionsSheet.svelte';
	import AddItemBox from '$lib/client/AddItemBox.svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { uuid } from '$lib/client/uuid';
	import { parseAdd, singularizeName } from '$lib/quantity';
	import { GLOBAL } from '$lib/types';

	const rows = $derived.by(() => {
		ui.rev;
		return currentRows();
	});
	const view = $derived(buildView(rows, GLOBAL));
	const placeNameOf = (id: string) => rows.places.get(id)?.name ?? '';
	const stores = $derived(view.groups.filter((g) => g.place));
	const loose = $derived(view.groups.find((g) => !g.place) ?? { place: null, items: [] });

	let optionsFor = $state<ItemView | null>(null);

	const suggestions = $derived(
		[...rows.items.values()]
			.filter((i) => !i.deleted_at)
			.map((i) => ({ name: i.name, on_list: !!rows.listState.get(i.id)?.on_list }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

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
		// new items go to the top of the list so you notice and place them
		mutate({
			type: 'add_item',
			item_id: uuid(),
			name: n,
			position: keys.before(loose.items[0]?.position ?? null),
			scope_place_id: GLOBAL,
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
</script>

<svelte:head><title>List</title></svelte:head>

<Screen title="List">
	<div class="page">
	{#if !stores.length && !loose.items.length && !view.checked.length}
		<div class="firstrun">
			<p>Add an item below to get started.</p>
		</div>
	{/if}

	<div class="groups">
		{#each stores as g (g.place!.id)}
			<div class="group" data-id={g.place!.id}>
				<div class="ghead">
					<a class="gname" href="/stores/{g.place!.id}">{g.place!.name}</a>
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
							<ItemRow item={it} place={GLOBAL} scopeName={g.place!.name} onOptions={(x) => (optionsFor = x)} />
						{/each}
					</ul>
				{/if}
			</div>
		{/each}

		<div class="group loose">
			<div class="ghead">
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
						<ItemRow item={it} place={GLOBAL} scopeName={placeNameOf(it.scope_place_id)} onOptions={(x) => (optionsFor = x)} />
					{/each}
				</ul>
			{/if}
		</div>
	</div>

	{#if view.checked.length}
		<section class="extra">
			<h2>
				Checked ({view.checked.length})
				<span class="grow"></span>
				<button class="link" onclick={() => mutate({ type: 'clear_checked' })}>Clear</button>
			</h2>
			<ul>
				{#each view.checked as it (it.id)}<ItemRow item={it} place={GLOBAL} scopeName={placeNameOf(it.scope_place_id)} onOptions={(x) => (optionsFor = x)} />{/each}
			</ul>
		</section>
	{/if}

	<ItemOptionsSheet
		item={optionsFor}
		place={GLOBAL}
		scopeName={optionsFor ? placeNameOf(optionsFor.scope_place_id) : ''}
		onClose={() => (optionsFor = null)}
	/>
	</div>
</Screen>

<footer class="quickadd">
	<AddItemBox {suggestions} boxed dropUp placeholder="Add item…" onAdd={addItem} />
</footer>

<style>
	.page {
		padding-bottom: calc(var(--tabbar-h) + var(--safe-b) + 4rem);
	}
	.firstrun {
		padding: 1.5rem 1rem;
		text-align: center;
		color: var(--text-2);
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
		padding: 0.35rem 0.6rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--line);
	}
	.gname {
		flex: 1;
		text-align: left;
		font-size: var(--fs-cap);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-2);
		text-decoration: none;
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
		font-size: var(--fs-sub);
		color: var(--text-2);
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
		color: var(--text-2);
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
		font-size: var(--fs-sub);
		color: var(--text-2);
	}
	.grow {
		flex: 1;
	}
	.quickadd {
		position: fixed;
		bottom: calc(var(--tabbar-h) + var(--safe-b) + var(--kb, 0px));
		left: 0;
		right: 0;
		z-index: 15;
		padding: 0.5rem 0.7rem;
		background: var(--surface-1);
		border-top: 1px solid var(--line);
	}
</style>
