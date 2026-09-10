<script lang="ts">
	import '$lib/styles/app.css';
	import { page } from '$app/state';
	import BottomTabBar from '$lib/nav/BottomTabBar.svelte';
	let { children } = $props();

	const p = $derived(page.url.pathname);
	const chromeless = $derived(
		p === '/login' ||
			p === '/recipes/new' ||
			p === '/recipes/import' ||
			/^\/recipes\/[^/]+\/edit$/.test(p)
	);
</script>

<svelte:head><meta name="theme-color" content="#141a24" /></svelte:head>

{@render children?.()}
{#if !chromeless}<BottomTabBar />{/if}

<style>
	:global(html),
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font: var(--fs-body) / 1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		overscroll-behavior-y: none;
	}
	:global(*) { box-sizing: border-box; }
	:global(button) { font: inherit; color: inherit; cursor: pointer; }
</style>
