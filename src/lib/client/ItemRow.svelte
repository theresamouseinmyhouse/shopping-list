<script lang="ts">
	import type { ItemView } from './view';
	import { mutate } from './store.svelte';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';

	let {
		item,
		place,
		scopeName = '',
		editing = $bindable(false)
	}: {
		item: ItemView;
		place: string;
		scopeName?: string; // name of the store this item is pinned to, if any
		editing?: boolean;
	} = $props();

	const placeSelected = $derived(place !== '');
	const pinnedHere = $derived(item.scope_place_id === place && placeSelected);
	const pinnedElsewhere = $derived(item.scope_place_id !== '' && item.scope_place_id !== place);

	let name = $state('');
	let note = $state('');
	function openEditor() {
		name = item.name;
		note = item.note;
		editing = true;
	}

	function tick() {
		try {
			navigator.vibrate?.(8);
		} catch {
			/* not supported */
		}
	}
	function toggleCheck() {
		tick();
		mutate({ type: 'set_check', item_id: item.id, checked: !item.checked });
	}
	function setQty(q: number) {
		mutate({ type: 'set_qty', item_id: item.id, qty: Math.max(1, q) });
	}
	function toggleHide() {
		mutate({ type: 'hide_item', item_id: item.id, scope_place_id: place, hidden: !item.hidden });
		editing = false;
	}
	function setScope(scope: string) {
		mutate({ type: 'set_item_scope', item_id: item.id, scope_place_id: scope });
		editing = false;
	}
	function removeFromList() {
		mutate({ type: 'remove_from_list', item_id: item.id });
		editing = false;
	}
	function deleteForever() {
		mutate({ type: 'delete_item', item_id: item.id });
		editing = false;
	}
	function saveEdit() {
		const n = name.trim();
		if (n && n !== item.name) mutate({ type: 'rename_item', item_id: item.id, name: n });
		if (note !== item.note) mutate({ type: 'set_note', item_id: item.id, note });
		editing = false;
	}

	// The label area is inert — checking is the check circle, options is the
	// chevron. Only a deliberate horizontal swipe-right on the body checks off
	// (a tap or a vertical scroll never does anything).
	let dx = $state(0);
	let start: { x: number; y: number } | null = null;
	let swiping = $state(false);

	function down(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('.handle, input, button')) return;
		start = { x: e.clientX, y: e.clientY };
		swiping = false;
		dx = 0;
	}
	function move(e: PointerEvent) {
		if (!start) return;
		const mx = e.clientX - start.x;
		const my = e.clientY - start.y;
		if (!swiping && (Math.abs(my) > 8 || mx < -8)) {
			start = null; // vertical scroll or leftward drag — not a check swipe
			return;
		}
		if (mx > 8) swiping = true;
		dx = Math.max(0, Math.min(mx, 120));
	}
	function up() {
		if (start && dx > 55) toggleCheck();
		start = null;
		swiping = false;
		dx = 0;
	}
</script>

<li class="row" data-id={item.id} data-name={item.name} class:dim={item.checked || item.hidden}>
	<div class="rowline" style="transform: translateX({dx}px)" class:swiping>
		<span class="handle item-handle" aria-hidden="true"><GripVertical size={18} /></span>
		<button
			class="check"
			aria-label={item.checked ? `Uncheck ${item.name}` : `Check off ${item.name}`}
			onclick={toggleCheck}
		>
			<span class="dot" class:on={item.checked}>
				{#if item.checked}<Check size={16} strokeWidth={3} />{/if}
			</span>
		</button>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="main"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			<span class="label">
				<span class="nm" class:struck={item.checked}>
					{item.name}{#if item.qty > 1}<span class="qty">×{item.qty}</span>{/if}
				</span>
				{#if item.note}<span class="nt">{item.note}</span>{/if}
			</span>
		</div>
		<button
			class="chev"
			aria-label="Item options"
			class:open={editing}
			onclick={() => (editing ? (editing = false) : openEditor())}
		>
			<ChevronRight size={22} strokeWidth={2.5} />
		</button>
	</div>

	{#if editing}
		<div class="edit">
			<input bind:value={name} placeholder="Name" onkeydown={(e) => e.key === 'Enter' && saveEdit()} />
			<input bind:value={note} placeholder="Note (2%, big jug…)" onkeydown={(e) => e.key === 'Enter' && saveEdit()} />
			<div class="stepper" aria-label="Quantity">
				<button aria-label="Less" onclick={() => setQty(item.qty - 1)}><Minus size={16} /></button>
				<span>{item.qty}</span>
				<button aria-label="More" onclick={() => setQty(item.qty + 1)}><Plus size={16} /></button>
			</div>
			<label class="staple">
				<input
					type="checkbox"
					checked={item.is_staple}
					onchange={(e) => mutate({ type: 'set_staple', item_id: item.id, is_staple: e.currentTarget.checked })}
				/> Staple
			</label>
			<div class="actions">
				{#if placeSelected}
					<button onclick={toggleHide}>{item.hidden ? 'Show here' : 'Hide here'}</button>
					{#if pinnedHere}
						<button onclick={() => setScope('')}>Show at every store</button>
					{:else}
						<button onclick={() => setScope(place)}>Only show here</button>
					{/if}
				{:else if pinnedElsewhere}
					<button onclick={() => setScope('')}>
						Only at {scopeName || 'one store'} — show everywhere
					</button>
				{/if}
				<button onclick={removeFromList}>Remove</button>
				<button class="danger" onclick={deleteForever}>Delete forever</button>
				<button class="save" onclick={saveEdit}>Done</button>
			</div>
		</div>
	{/if}
</li>

<style>
	.row {
		list-style: none;
		border-bottom: 1px solid var(--line);
		background: var(--bg);
		overflow: hidden;
	}
	.row:has(.swiping) {
		background: linear-gradient(to right, #16a34a 0 3rem, var(--bg) 3rem);
	}
	.row.dim .label {
		opacity: 0.55;
	}
	.rowline {
		display: flex;
		align-items: center;
		background: var(--bg);
	}
	.rowline:not(.swiping) {
		transition: transform 0.15s ease;
	}
	.main {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.1rem 0;
		min-height: 3rem;
		touch-action: pan-y;
		user-select: none;
		min-width: 0;
	}
	.handle {
		flex: none;
		display: grid;
		place-items: center;
		cursor: grab;
		touch-action: none;
		padding: 0.7rem 0.15rem 0.7rem 0.4rem;
		color: var(--muted);
	}
	.check {
		flex: none;
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		padding: 0;
		background: none;
		border: 0;
		-webkit-tap-highlight-color: transparent;
	}
	.check .dot {
		width: 1.6rem;
		height: 1.6rem;
		border: 2px solid var(--check-line);
		border-radius: 999px;
		display: grid;
		place-items: center;
		color: #fff;
	}
	.check:active .dot {
		transform: scale(0.9);
	}
	.check .dot.on {
		background: #16a34a;
		border-color: #16a34a;
	}
	.label {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
		padding: 0.55rem 0;
	}
	.nm {
		font-size: 1rem;
	}
	.nm.struck {
		text-decoration: line-through;
	}
	.qty {
		margin-left: 0.4rem;
		font-size: 0.8rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.nt {
		font-size: 0.78rem;
		color: var(--muted);
	}
	.chev {
		flex: none;
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		background: none;
		border: 0;
		color: var(--muted);
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.edit {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		padding: 0 0.6rem 0.7rem 3.2rem;
		background: var(--bg);
	}
	.edit input:not([type='checkbox']) {
		flex: 1 1 8rem;
		padding: 0.5rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
		color: inherit;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.stepper button {
		display: grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		border: 0;
		background: var(--surface);
	}
	.stepper span {
		min-width: 1.4rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.staple {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		width: 100%;
	}
	.actions button {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		padding: 0.4rem 0.7rem;
		font-size: 0.85rem;
	}
	.actions .danger {
		color: var(--danger);
	}
	.actions .save {
		margin-left: auto;
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
</style>
