<script lang="ts">
	import { ui, currentRows, mutate, keys } from '$lib/client/store.svelte';
	import { normalizeName } from '$lib/types';
	import { uuid } from '$lib/client/uuid';
	import Star from '@lucide/svelte/icons/star';
	import Screen from '$lib/nav/Screen.svelte';
	import Sheet from '$lib/nav/Sheet.svelte';

	const rows = $derived.by(() => {
		ui.rev;
		return currentRows();
	});

	interface Row {
		id: string;
		name: string;
		note: string;
		is_staple: boolean;
		on_list: boolean;
	}

	const items = $derived(
		[...rows.items.values()]
			.filter((i) => !i.deleted_at)
			.map<Row>((i) => ({
				id: i.id,
				name: i.name,
				note: i.note,
				is_staple: !!i.is_staple,
				on_list: !!rows.listState.get(i.id)?.on_list
			}))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	let q = $state('');
	let staplesOnly = $state(false);
	let editing = $state<string | null>(null);
	let draftName = $state('');
	let draftNote = $state('');
	const editingItem = $derived(items.find((i) => i.id === editing) ?? null);

	const filtered = $derived(
		items.filter(
			(i) =>
				(!staplesOnly || i.is_staple) &&
				(!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))
		)
	);

	// near-duplicate name groups (normalized) — a light nudge, not automatic
	const dupeGroups = $derived.by(() => {
		const byNorm = new Map<string, Row[]>();
		for (const i of items) {
			const k = normalizeName(i.name);
			let g = byNorm.get(k);
			if (!g) byNorm.set(k, (g = []));
			g.push(i);
		}
		return [...byNorm.values()].filter((g) => g.length > 1);
	});

	function open(i: Row) {
		editing = i.id;
		draftName = i.name;
		draftNote = i.note;
	}
	function save(i: Row) {
		const n = draftName.trim();
		if (n && n !== i.name) mutate({ type: 'rename_item', item_id: i.id, name: n });
		if (draftNote !== i.note) mutate({ type: 'set_note', item_id: i.id, note: draftNote });
		editing = null;
	}
	function addToList(i: Row) {
		mutate({
			type: 'add_item',
			item_id: i.id,
			name: i.name,
			position: keys.after(null),
			scope_place_id: ''
		});
	}
	function del(i: Row) {
		if (confirm(`Delete "${i.name}" from your items? This forgets where it goes.`)) {
			mutate({ type: 'delete_item', item_id: i.id });
			editing = null;
		}
	}
	function newItem() {
		const name = q.trim();
		if (!name) return;
		mutate({
			type: 'add_item',
			item_id: uuid(),
			name,
			position: keys.after(null),
			scope_place_id: ''
		});
		q = '';
	}
</script>

<svelte:head><title>Items</title></svelte:head>

<Screen title="Items">
	{#snippet actions()}
		<label class="staple-toggle"><input type="checkbox" bind:checked={staplesOnly} /> Staples</label>
	{/snippet}

	<div class="tools">
		<input
			class="field"
			bind:value={q}
			placeholder="Search items"
			onkeydown={(e) => e.key === 'Enter' && !filtered.length && newItem()}
		/>
	</div>

	{#if dupeGroups.length && !staplesOnly && !q}
		<div class="dupes">
			{#each dupeGroups as g}
				<div class="dupe">
					Possible duplicates: {g.map((x) => `"${x.name}"`).join(', ')} — rename or delete the extras
					below.
				</div>
			{/each}
		</div>
	{/if}

	{#if !filtered.length}
		<p class="empty">
			{#if q.trim()}
				No item called “{q.trim()}”. <button class="btn btn-plain" onclick={newItem}>Add it</button>
			{:else if staplesOnly}
				No staples yet. Open an item and mark it a staple.
			{:else}
				No items yet.
			{/if}
		</p>
	{/if}

	{#each filtered as i (i.id)}
		<div class="item">
			<div class="line">
				<button
					class="star"
					class:on={i.is_staple}
					title={i.is_staple ? 'Unmark staple' : 'Mark as staple'}
					onclick={() => mutate({ type: 'set_staple', item_id: i.id, is_staple: !i.is_staple })}
				>
					<Star size={20} fill={i.is_staple ? 'currentColor' : 'none'} />
				</button>
				<button class="body" onclick={() => open(i)}>
					<span class="name">{i.name}</span>
					{#if i.note}<span class="note">{i.note}</span>{/if}
				</button>
				{#if i.on_list}
					<span class="badge">on list</span>
				{:else}
					<button class="add" onclick={() => addToList(i)}>+ list</button>
				{/if}
			</div>
		</div>
	{/each}

	<Sheet
		open={editing !== null}
		onClose={() => (editing = null)}
		title={editingItem?.name ?? 'Item'}
	>
		{#if editingItem}
			<input class="field" bind:value={draftName} placeholder="Name" />
			<input class="field" bind:value={draftNote} placeholder="Note (2%, big jug…)" />
			<label class="staple-toggle">
				<input
					type="checkbox"
					checked={editingItem.is_staple}
					onchange={(e) =>
						editingItem &&
						mutate({
							type: 'set_staple',
							item_id: editingItem.id,
							is_staple: e.currentTarget.checked
						})}
				/>
				Staple
			</label>
		{/if}
		{#snippet foot()}
			<button class="btn btn-danger" onclick={() => editingItem && del(editingItem)}>Delete</button>
			<span style="flex:1"></span>
			<button class="btn" onclick={() => (editing = null)}>Cancel</button>
			<button class="btn btn-primary" onclick={() => editingItem && save(editingItem)}>Done</button>
		{/snippet}
	</Sheet>
</Screen>

<style>
	.tools { padding: 0 0.7rem 0.6rem; }
	.staple-toggle { display: flex; align-items: center; gap: 0.3rem; font-size: var(--fs-sub); color: var(--text-2); }
	.dupes {
		padding: 0.5rem 0.7rem;
	}
	.dupe {
		font-size: 0.8rem;
		color: var(--text-2);
		background: var(--surface-2);
		border-radius: 0.5rem;
		padding: 0.5rem 0.6rem;
		margin-bottom: 0.4rem;
	}
	.empty {
		padding: 1rem 0.7rem;
		color: var(--text-2);
	}
	.item {
		border-bottom: 1px solid var(--line);
	}
	.line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.15rem 0.6rem;
		min-height: 2.9rem;
	}
	.star {
		flex: none;
		display: inline-grid;
		place-items: center;
		background: none;
		border: 0;
		color: var(--text-3);
		padding: 0.5rem 0.3rem;
	}
	.star.on {
		color: #f59e0b;
	}
	.body {
		flex: 1;
		text-align: left;
		background: none;
		border: 0;
		padding: 0.5rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.name {
		font-size: 1rem;
	}
	.note {
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.badge {
		flex: none;
		font-size: 0.7rem;
		color: var(--text-3);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}
	.add {
		flex: none;
		background: var(--surface-1);
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		padding: 0.35rem 0.6rem;
		font-size: 0.85rem;
		color: var(--accent);
	}
</style>
