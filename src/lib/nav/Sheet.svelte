<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		onClose,
		children,
		foot
	}: {
		open?: boolean;
		title?: string;
		onClose?: () => void;
		children: Snippet;
		foot?: Snippet;
	} = $props();

	let panel = $state<HTMLElement>();
	let dragY = $state(0);

	function dismiss() {
		if (onClose) onClose();
		else open = false;
	}

	/**
	 * Dismiss from a pointer interaction (backdrop tap, swipe). The backdrop covers
	 * the whole viewport, so removing it synchronously inside the click handler
	 * strands the browser's pointer target on the removed node until the next
	 * pointermove — the immediate next tap anywhere "does nothing". Defer the
	 * unmount to the next macrotask so the click event fully settles first.
	 */
	function dismissDeferred() {
		setTimeout(dismiss, 0);
	}

	$effect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
		window.addEventListener('keydown', onKey);
		const opener = document.activeElement as HTMLElement | null;
		panel?.focus();
		return () => {
			document.body.style.overflow = prev;
			window.removeEventListener('keydown', onKey);
			if (opener?.isConnected) opener.focus?.();
		};
	});

	let start = 0;
	function down(e: PointerEvent) {
		start = e.clientY;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!start) return;
		dragY = Math.max(0, e.clientY - start);
	}
	function up() {
		const shouldClose = dragY > 60;
		start = 0;
		dragY = 0;
		if (shouldClose) dismissDeferred();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="sheet-backdrop noprint" role="presentation" onclick={dismissDeferred}></div>
	<div
		class="sheet-panel noprint"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		bind:this={panel}
		style="transform: translateY({dragY}px)"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="grip" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
			<span></span>
		</div>
		{#if title}<h2>{title}</h2>{/if}
		<div class="body">{@render children()}</div>
		{#if foot}<div class="foot">{@render foot()}</div>{/if}
	</div>
{/if}

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgb(0 0 0 / 0.5);
		animation: fade var(--dur) both;
	}
	.sheet-panel {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 51;
		max-height: 85vh;
		overflow-y: auto;
		background: var(--surface-1);
		border-radius: var(--r-lg) var(--r-lg) 0 0;
		box-shadow: var(--shadow-sheet);
		padding: 0 1rem calc(1rem + var(--safe-b));
		animation: rise var(--dur-sheet) var(--ease) both;
	}
	.grip { display: grid; place-items: center; padding: 0.6rem 0; touch-action: none; cursor: grab; }
	.grip span { width: 2.2rem; height: 0.28rem; border-radius: var(--r-full); background: var(--surface-3); }
	h2 { margin: 0 0 0.6rem; font-size: var(--fs-head); font-weight: var(--fw-head); }
	.body { display: flex; flex-direction: column; gap: 0.6rem; }
	.foot { display: flex; gap: 0.5rem; margin-top: 0.9rem; }
	@keyframes rise { from { transform: translateY(100%); } }
	@keyframes fade { from { opacity: 0; } }
	@media (prefers-reduced-motion: reduce) {
		.sheet-panel { animation: fade var(--dur) both; }
	}
</style>
