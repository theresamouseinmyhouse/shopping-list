<script lang="ts">
	import { onMount } from 'svelte';
	import { boot, ui, sync } from '$lib/client/store.svelte';
	import InstallHint from '$lib/client/InstallHint.svelte';
	let { children } = $props();

	onMount(() => {
		void boot();

		// The viewport meta (interactive-widget=resizes-visual) stops the keyboard from
		// reflowing the page. It also then sits *over* the bottom bar — so track the
		// visual viewport and lift bottom-fixed UI by the keyboard height via --kb.
		const vv = window.visualViewport;
		if (!vv) return;
		let raf = 0;
		const update = () => {
			raf = 0;
			const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
			document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
		};
		const schedule = () => {
			if (!raf) raf = requestAnimationFrame(update);
		};
		vv.addEventListener('resize', schedule);
		vv.addEventListener('scroll', schedule);
		update();
		return () => {
			vv.removeEventListener('resize', schedule);
			vv.removeEventListener('scroll', schedule);
			cancelAnimationFrame(raf);
		};
	});
</script>

{#if ui.booted && (!ui.online || ui.pending > 0)}
	<button
		class="statusbar"
		class:offline={!ui.online}
		onclick={() => sync()}
		title="Tap to sync now"
	>
		{#if !ui.online}Offline{/if}
		{#if ui.pending > 0}{!ui.online ? ' · ' : ''}{ui.pending} unsynced{/if}
		{#if ui.online && ui.pending > 0}, syncing…{/if}
	</button>
{/if}

<InstallHint />

<div class="group-scroll">{@render children?.()}</div>

<style>
	/* Floating pill — overlays content, never reflows the page. */
	.statusbar {
		position: fixed;
		top: calc(env(safe-area-inset-top, 0px) + 0.4rem);
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
		max-width: calc(100% - 1rem);
		border: 0;
		border-radius: 999px;
		padding: 0.4rem 0.9rem;
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
		background: var(--accent);
		color: #fff;
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.25);
	}
	.statusbar.offline {
		background: var(--muted);
	}
	.group-scroll { padding-bottom: calc(var(--tabbar-h) + var(--safe-b) + 0.5rem); min-height: 100vh; }
</style>
