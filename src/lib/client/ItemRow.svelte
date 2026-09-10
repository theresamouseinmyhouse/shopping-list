<script lang="ts">
	import type { ItemView } from './view';
	import { mutate } from './store.svelte';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let {
		item,
		place,
		scopeName = '',
		onOptions
	}: {
		item: ItemView;
		place: string;
		scopeName?: string; // name of the store this item is pinned to, if any
		onOptions: (item: ItemView) => void;
	} = $props();

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

<li class="itemrow" data-id={item.id} data-name={item.name} class:dim={item.checked || item.hidden}>
	<div class="rowline" style="transform: translateX({dx}px)" class:swiping>
		<span class="handle item-handle" aria-hidden="true"><GripVertical size={20} /></span>
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
		<button class="chev" aria-label="Item options" onclick={() => onOptions(item)}>
			<ChevronRight size={22} strokeWidth={2.5} />
		</button>
	</div>
</li>

<style>
	.itemrow {
		list-style: none;
		border-bottom: 1px solid var(--line);
		background: var(--bg);
		overflow: hidden;
	}
	.itemrow:has(.swiping) {
		background: linear-gradient(to right, var(--good) 0 3rem, var(--bg) 3rem);
	}
	.itemrow.dim .label {
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
		align-self: stretch;
		min-width: 2.75rem;
		cursor: grab;
		touch-action: none;
		padding: 0.7rem 0.6rem 0.7rem 0.5rem;
		color: var(--text-3);
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
		border: 2px solid var(--line-strong);
		border-radius: 999px;
		display: grid;
		place-items: center;
		color: #fff;
	}
	.check:active .dot {
		transform: scale(0.9);
	}
	.check .dot.on {
		background: var(--good);
		border-color: var(--good);
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
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
	}
	.nt {
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.chev {
		flex: none;
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		background: none;
		border: 0;
		color: var(--text-2);
	}
</style>
