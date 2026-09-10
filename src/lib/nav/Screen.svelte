<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';

	let {
		title,
		back,
		actions,
		children
	}: {
		title: string;
		back?: string;
		actions?: Snippet;
		children: Snippet;
	} = $props();

	let scrolled = $state(false);
	$effect(() => {
		const onScroll = () => (scrolled = window.scrollY > 28);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<header class="screen-head noprint" data-scrolled={scrolled || undefined}>
	{#if back}
		<a class="back" href={back} aria-label="Back"><ChevronLeft size={22} /></a>
	{/if}
	<span class="peek-title">{title}</span>
	<span class="spacer"></span>
	{#if actions}<span class="actions">{@render actions()}</span>{/if}
</header>

<h1 class="screen-title">{title}</h1>
{@render children()}

<style>
	.screen-head {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		height: var(--header-h);
		padding: 0 0.7rem;
		background: var(--surface-1);
		border-bottom: 1px solid transparent;
		transition: border-color var(--dur);
	}
	.screen-head[data-scrolled] { border-bottom-color: var(--line); }
	.back { display: grid; place-items: center; color: var(--accent); margin-left: -0.3rem; }
	.peek-title {
		font-weight: var(--fw-head);
		opacity: 0;
		transition: opacity var(--dur);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.screen-head[data-scrolled] .peek-title { opacity: 1; }
	.spacer { flex: 1; }
	.actions { display: flex; align-items: center; gap: 0.4rem; flex: none; }
	.screen-title {
		margin: 0.3rem 0 0.7rem;
		padding: 0 0.7rem;
		font-size: var(--fs-title);
		font-weight: var(--fw-title);
		letter-spacing: -0.01em;
	}
	@media print { .screen-title { padding: 0; } }
</style>
