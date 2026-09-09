<script lang="ts">
	import { ui, currentRows, mutate, setPlace, keys } from '$lib/client/store.svelte';
	import { buildView } from '$lib/client/view';
	import { resolvePlacement, resolveSectionOrder } from '$lib/client/rows';
	import { sortable, type SortableMove } from '$lib/client/sortable';
	import ItemRow from '$lib/client/ItemRow.svelte';
	import AddItemBox from '$lib/client/AddItemBox.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Eye from '@lucide/svelte/icons/eye';
	import X from '@lucide/svelte/icons/x';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
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

	const suggestions = $derived(
		[...rows.items.values()]
			.filter((i) => !i.deleted_at)
			.map((i) => ({ name: i.name, on_list: !!rows.listState.get(i.id)?.on_list }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	let arrange = $state(false);
	let newSection = $state('');
	let editingPlace = $state(false);
	let placeName = $state('');
	let editingSection = $state<string | null>(null);

	function addItem(raw: string, sectionId: string | null) {
		const { qty, name: parsed } = parseAdd(raw);
		const n = (qty != null ? singularizeName(parsed) : parsed).trim();
		if (!n) return;
		const bucket = sectionId
			? (view.sections.find((s) => s.section_id === sectionId)?.items ?? [])
			: view.unsectioned;
		const last = bucket.at(-1)?.position ?? null;
		mutate({
			type: 'add_item',
			item_id: uuid(),
			name: n,
			position: keys.after(last),
			scope_place_id: ui.place,
			section_id: sectionId ?? undefined,
			qty: qty ?? 1
		});
	}

	function addSection() {
		const name = newSection.trim();
		if (!name) return;
		const id = uuid();
		const last = resolveSectionOrder(rows, ui.place).at(-1)?.position ?? null;
		mutate({ type: 'add_section', section_id: id, name, place_id: GLOBAL, position: keys.after(last) });
		if (ui.place !== GLOBAL) {
			for (const p of view.places) {
				if (p.id !== ui.place) {
					mutate({ type: 'hide_section', scope_place_id: p.id, section_id: id, hidden: true });
				}
			}
		}
		newSection = '';
	}

	function onItemMove(m: SortableMove) {
		const scope = ui.place;
		const prevId = m.toOrder[m.newIndex - 1];
		const nextId = m.toOrder[m.newIndex + 1];
		const pos = (id: string | undefined) =>
			id ? resolvePlacement(rows, id, scope).position : null;
		mutate({
			type: 'move_item',
			item_id: m.itemId,
			scope_place_id: scope,
			section_id: m.toZone,
			position: keys.between(pos(prevId), pos(nextId))
		});
	}

	function onSectionMove(m: SortableMove) {
		const scope = ui.place;
		const posById = new Map(resolveSectionOrder(rows, scope).map((s) => [s.section_id, s.position]));
		const prev = m.toOrder[m.newIndex - 1];
		const next = m.toOrder[m.newIndex + 1];
		mutate({
			type: 'move_section',
			scope_place_id: scope,
			section_id: m.itemId,
			position: keys.between(posById.get(prev) ?? null, posById.get(next) ?? null)
		});
	}

	function renameSection(id: string, name: string) {
		const n = name.trim();
		if (n) mutate({ type: 'rename_section', section_id: id, name: n });
	}
	function savePlace() {
		const n = placeName.trim();
		if (n) mutate({ type: 'rename_place', place_id: ui.place, name: n });
		editingPlace = false;
	}
	function deletePlace() {
		if (confirm('Delete this place? Items stay on the list.')) {
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
			<a class="link" href="/sections">Sections</a>
			<a class="link" href="/recipes">Recipes</a>
			<button class="link arrange" class:on={arrange} onclick={() => (arrange = !arrange)}>
				{#if arrange}Done{:else}<ArrowUpDown size={15} /> Arrange{/if}
			</button>
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

{#snippet addItemRow(sectionId: string | null)}
	<div class="additem">
		<AddItemBox {suggestions} onAdd={(name) => addItem(name, sectionId)} />
	</div>
{/snippet}

<main>
	{#if !view.places.length && !view.sections.length && !view.unsectioned.length}
		<div class="firstrun">
			<p>Add the stores you shop at, then aisles for each.</p>
			<button onclick={addPlace}>+ Add a store</button>
		</div>
	{/if}

	{#if arrange}
		<div class="addsection">
			<input
				bind:value={newSection}
				placeholder="+ Add a section / aisle"
				onkeydown={(e) => e.key === 'Enter' && addSection()}
			/>
		</div>
	{/if}

	<div
		class="sections"
		use:sortable={{
			group: 'sections',
			zone: '__sections__',
			handle: '.sec-handle',
			disabled: !arrange,
			onMove: onSectionMove
		}}
	>
		{#each view.sections as sec (sec.section_id)}
			<section class="sec" data-id={sec.section_id} data-zone={sec.section_id}>
				<h2>
					{#if arrange}<span class="sec-handle" title="Drag to reorder"><GripVertical size={16} /></span>{/if}
					{#if editingSection === sec.section_id}
						<input
							value={sec.name}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									renameSection(sec.section_id, e.currentTarget.value);
									editingSection = null;
								}
							}}
							onblur={(e) => {
								renameSection(sec.section_id, e.currentTarget.value);
								editingSection = null;
							}}
						/>
					{:else}
						<button class="sec-name" onclick={() => (editingSection = sec.section_id)}>{sec.name}</button>
					{/if}
					<span class="grow"></span>
					{#if arrange}
						{#if placeSelected}
							<button
								class="ic"
								title="Hide this section here"
								onclick={() =>
									mutate({ type: 'hide_section', scope_place_id: ui.place, section_id: sec.section_id, hidden: true })}
								><EyeOff size={16} /></button
							>
						{/if}
						<button
							class="ic"
							title="Delete section"
							onclick={() => mutate({ type: 'delete_section', section_id: sec.section_id })}
							><X size={16} /></button
						>
					{/if}
				</h2>
				<ul
					data-zone={sec.section_id}
					class:emptyzone={sec.items.length === 0 && arrange}
					use:sortable={{
						group: 'items',
						zone: sec.section_id,
						handle: '.item-handle',
						disabled: !arrange,
						onMove: onItemMove
					}}
				>
					{#each sec.items as it (it.id)}
						<ItemRow item={it} place={ui.place} scopeName={placeNameOf(it.scope_place_id)} {arrange} />
					{/each}
				</ul>
				{@render addItemRow(sec.section_id)}
			</section>
		{/each}
	</div>

	<section class="sec">
		{#if view.sections.length}<h2 class="plain">Unsorted</h2>{/if}
		<ul
			data-zone={GLOBAL}
			use:sortable={{ group: 'items', zone: GLOBAL, handle: '.item-handle', disabled: !arrange, onMove: onItemMove }}
		>
			{#each view.unsectioned as it (it.id)}
				<ItemRow item={it} place={ui.place} scopeName={placeNameOf(it.scope_place_id)} {arrange} />
			{/each}
		</ul>
		{@render addItemRow(null)}
	</section>

	{#if view.hidden.length}
		<section class="sec dim">
			<h2 class="plain">Hidden here ({view.hidden.length})</h2>
			<ul>
				{#each view.hidden as it (it.id)}<ItemRow item={it} place={ui.place} scopeName={placeNameOf(it.scope_place_id)} />{/each}
			</ul>
		</section>
	{/if}

	{#if view.checked.length}
		<section class="sec dim">
			<h2 class="plain">
				Checked ({view.checked.length})
				<span class="grow"></span>
				<button class="link" onclick={() => mutate({ type: 'clear_checked' })}>Clear</button>
			</h2>
			<ul>
				{#each view.checked as it (it.id)}<ItemRow item={it} place={ui.place} scopeName={placeNameOf(it.scope_place_id)} />{/each}
			</ul>
		</section>
	{/if}

	{#if view.hiddenSections.length}
		<section class="sec dim">
			<h2 class="plain">Hidden sections here</h2>
			<div class="hiddensecs">
				{#each view.hiddenSections as hs (hs.section_id)}
					<button
						class="unhide"
						onclick={() =>
							mutate({ type: 'hide_section', scope_place_id: ui.place, section_id: hs.section_id, hidden: false })}
						><Eye size={14} /> {hs.name}</button
					>
				{/each}
			</div>
		</section>
	{/if}
</main>

<footer class="quickadd">
	<AddItemBox {suggestions} boxed dropUp placeholder="Add item…" onAdd={(name) => addItem(name, null)} />
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
	.link.on {
		font-weight: 700;
	}
	.link.arrange {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
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
	.addsection {
		padding: 0.6rem 0.5rem 0.3rem;
	}
	.addsection input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px dashed var(--line);
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		font-size: 0.9rem;
	}
	.sec h2 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		padding: 0.7rem 0.5rem 0.3rem;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.sec h2.plain {
		text-transform: none;
		letter-spacing: 0;
	}
	.sec-handle {
		cursor: grab;
		touch-action: none;
		font-size: 1rem;
	}
	.sec-name {
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		padding: 0.3rem 0;
	}
	.sec h2 input {
		font: inherit;
		padding: 0.25rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 0.4rem;
		background: var(--surface);
		color: inherit;
	}
	.grow {
		flex: 1;
	}
	.ic {
		display: inline-grid;
		place-items: center;
		background: none;
		border: 0;
		padding: 0.5rem;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.sec ul.emptyzone {
		min-height: 2rem;
		margin: 0 0.5rem;
		border: 1px dashed var(--line);
		border-radius: 0.5rem;
	}
	.additem {
		padding: 0.1rem 0.5rem 0.4rem 2.7rem;
	}
	.sec.dim {
		opacity: 0.85;
	}
	.hiddensecs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0.2rem 0.5rem 0.6rem;
	}
	.unhide {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		padding: 0.35rem 0.7rem;
		font-size: 0.85rem;
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
