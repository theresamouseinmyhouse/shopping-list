<script lang="ts">
	import { ui, currentRows, mutate, keys } from '$lib/client/store.svelte';
	import { resolveSectionOrder, sectionHiddenIn } from '$lib/client/rows';
	import { uuid } from '$lib/client/uuid';
	import { GLOBAL, type PlaceScope } from '$lib/types';
	import X from '@lucide/svelte/icons/x';
	import Check from '@lucide/svelte/icons/check';

	const rows = $derived.by(() => {
		ui.rev;
		return currentRows();
	});

	const places = $derived(
		[...rows.places.values()]
			.filter((p) => !p.deleted_at)
			.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
	);

	const sections = $derived(
		[...rows.sections.values()]
			.filter((s) => !s.deleted_at)
			.map((s) => s.id)
			.sort((a, b) => (rows.sections.get(a)!.name).localeCompare(rows.sections.get(b)!.name))
			.map((id) => rows.sections.get(id)!)
	);

	let newName = $state('');
	let editing = $state<string | null>(null);
	let draft = $state('');

	function endPos(scope: PlaceScope) {
		return keys.after(resolveSectionOrder(rows, scope).at(-1)?.position ?? null);
	}
	function add() {
		const name = newName.trim();
		if (!name) return;
		mutate({ type: 'add_section', section_id: uuid(), name, place_id: GLOBAL, position: endPos(GLOBAL) });
		newName = '';
	}
	function rename(id: string) {
		const n = draft.trim();
		if (n) mutate({ type: 'rename_section', section_id: id, name: n });
		editing = null;
	}
	function toggle(sectionId: string, placeId: string, showNow: boolean) {
		mutate({ type: 'hide_section', scope_place_id: placeId, section_id: sectionId, hidden: showNow });
	}
	function del(id: string, name: string) {
		if (confirm(`Delete the "${name}" section? Items in it move to Unsorted.`)) {
			mutate({ type: 'delete_section', section_id: id });
			editing = null;
		}
	}
</script>

<svelte:head><title>Sections</title></svelte:head>

<header>
	<div class="topbar">
		<a class="link" href="/">‹ List</a>
		<strong>Sections</strong>
		<span></span>
	</div>
	<div class="add">
		<input bind:value={newName} placeholder="+ Add a section / aisle" onkeydown={(e) => e.key === 'Enter' && add()} />
	</div>
</header>

<main>
	{#if !sections.length}
		<p class="empty">No sections yet. Add one above.</p>
	{:else if !places.length}
		<p class="hint">Add some stores and you can choose which aisles apply to each.</p>
	{:else}
		<p class="hint">Checked = this aisle shows at that store. New stores show every aisle by default.</p>
	{/if}

	{#each sections as s (s.id)}
		<div class="sec" data-id={s.id}>
			<div class="line">
				{#if editing === s.id}
					<input bind:value={draft} onkeydown={(e) => e.key === 'Enter' && rename(s.id)} onblur={() => rename(s.id)} />
				{:else}
					<button class="name" onclick={() => { editing = s.id; draft = s.name; }}>{s.name}</button>
				{/if}
				<span class="grow"></span>
				<button class="del" title="Delete section" onclick={() => del(s.id, s.name)}><X size={16} /></button>
			</div>

			{#if places.length}
				<div class="stores">
					{#each places as p (p.id)}
						{@const show = !sectionHiddenIn(rows, s.id, p.id)}
						<button class="store" class:on={show} onclick={() => toggle(s.id, p.id, show)}>
							<span class="box">{#if show}<Check size={13} strokeWidth={3} />{/if}</span>{p.name}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</main>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	.topbar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 0.5rem 0.7rem 0.2rem;
	}
	.topbar strong {
		text-align: center;
	}
	.link {
		color: var(--accent);
		font-size: 0.9rem;
		text-decoration: none;
	}
	.add {
		padding: 0.3rem 0.7rem 0.6rem;
	}
	.add input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
		color: inherit;
	}
	main {
		padding-bottom: 3rem;
	}
	.empty,
	.hint {
		padding: 0.8rem 0.7rem;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.sec {
		border-bottom: 1px solid var(--line);
		padding: 0.4rem 0.6rem 0.6rem;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.6rem;
	}
	.name {
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		font-size: 1rem;
		padding: 0.4rem 0;
		text-align: left;
	}
	.line input {
		font: inherit;
		font-size: 1rem;
		padding: 0.35rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 0.4rem;
		background: var(--surface);
		color: inherit;
	}
	.grow {
		flex: 1;
	}
	.del {
		background: none;
		border: 0;
		color: var(--danger);
		font-size: 0.95rem;
		padding: 0.3rem 0.4rem;
	}
	.stores {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding-top: 0.4rem;
	}
	.store {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		padding: 0.3rem 0.7rem 0.3rem 0.4rem;
		font-size: 0.85rem;
	}
	.store.on {
		border-color: var(--accent);
		color: var(--text);
	}
	.box {
		width: 1.1rem;
		height: 1.1rem;
		display: inline-grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 0.3rem;
		font-size: 0.75rem;
	}
	.store.on .box {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
</style>
