<script lang="ts">
	import type { ItemView } from './view';
	import { mutate } from './store.svelte';
	import Sheet from '$lib/nav/Sheet.svelte';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';

	let {
		item,
		place,
		scopeName = '',
		onClose
	}: { item: ItemView | null; place: string; scopeName?: string; onClose: () => void } = $props();

	let name = $state('');
	let note = $state('');
	$effect(() => {
		if (item) {
			name = item.name;
			note = item.note;
		}
	});

	const placeSelected = $derived(place !== '');
	const pinnedHere = $derived(!!item && item.scope_place_id === place && placeSelected);
	const pinnedElsewhere = $derived(!!item && item.scope_place_id !== '' && item.scope_place_id !== place);

	function setQty(q: number) {
		if (item) mutate({ type: 'set_qty', item_id: item.id, qty: Math.max(1, q) });
	}
	function save() {
		if (!item) return;
		if (name.trim() && name.trim() !== item.name) mutate({ type: 'rename_item', item_id: item.id, name: name.trim() });
		if (note !== item.note) mutate({ type: 'set_note', item_id: item.id, note });
		onClose();
	}
	function toggleHide() {
		if (item) mutate({ type: 'hide_item', item_id: item.id, scope_place_id: place, hidden: !item.hidden });
		onClose();
	}
	function setScope(scope: string) {
		if (item) mutate({ type: 'set_item_scope', item_id: item.id, scope_place_id: scope });
		onClose();
	}
	function removeFromList() {
		if (item) mutate({ type: 'remove_from_list', item_id: item.id });
		onClose();
	}
	function deleteForever() {
		if (item) mutate({ type: 'delete_item', item_id: item.id });
		onClose();
	}
</script>

<Sheet open={item !== null} title={item?.name ?? 'Item'} {onClose}>
	{#if item}
		<input class="field" bind:value={name} placeholder="Name" />
		<input class="field" bind:value={note} placeholder="Note (2%, big jug…)" />
		<div class="qtyrow">
			<span class="caption">Quantity</span>
			<div class="stepper">
				<button aria-label="Less" onclick={() => setQty(item.qty - 1)}><Minus size={16} /></button>
				<span>{item.qty}</span>
				<button aria-label="More" onclick={() => setQty(item.qty + 1)}><Plus size={16} /></button>
			</div>
		</div>
		<label class="staple">
			<input type="checkbox" checked={item.is_staple}
				onchange={(e) => mutate({ type: 'set_staple', item_id: item.id, is_staple: e.currentTarget.checked })} />
			Staple
		</label>
		<div class="acts">
			{#if placeSelected}
				<button class="btn" onclick={toggleHide}>{item.hidden ? 'Show here' : 'Hide here'}</button>
				{#if pinnedHere}
					<button class="btn" onclick={() => setScope('')}>Show at every store</button>
				{:else}
					<button class="btn" onclick={() => setScope(place)}>Only show here</button>
				{/if}
			{:else if pinnedElsewhere}
				<button class="btn" onclick={() => setScope('')}>Only at {scopeName || 'one store'} — show everywhere</button>
			{/if}
			<button class="btn" onclick={removeFromList}>Remove from list</button>
			<button class="btn btn-danger" onclick={deleteForever}>Delete forever</button>
		</div>
	{/if}
	{#snippet foot()}
		<span style="flex:1"></span>
		<button class="btn" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" onclick={save}>Done</button>
	{/snippet}
</Sheet>

<style>
	.qtyrow { display: flex; align-items: center; justify-content: space-between; }
	.stepper { display: flex; align-items: center; gap: 0.3rem; border: 1px solid var(--line-strong); border-radius: var(--r-md); overflow: hidden; }
	.stepper button { display: grid; place-items: center; width: 2.4rem; height: 2.4rem; border: 0; background: var(--surface-2); }
	.stepper span { min-width: 1.6rem; text-align: center; font-variant-numeric: tabular-nums; }
	.staple { display: flex; align-items: center; gap: 0.4rem; font-size: var(--fs-sub); color: var(--text-2); }
	.acts { display: flex; flex-direction: column; gap: 0.4rem; }
	.acts .btn { justify-content: flex-start; }
</style>
