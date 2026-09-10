<script lang="ts">
	import { page } from '$app/state';
	import List from '@lucide/svelte/icons/list';
	import Store from '@lucide/svelte/icons/store';
	import Package from '@lucide/svelte/icons/package';
	import BookOpen from '@lucide/svelte/icons/book-open';

	const tabs = [
		{ href: '/', label: 'List', icon: List, match: (p: string) => p === '/' },
		{ href: '/stores', label: 'Stores', icon: Store, match: (p: string) => p.startsWith('/stores') },
		{ href: '/catalog', label: 'Items', icon: Package, match: (p: string) => p === '/catalog' },
		{ href: '/recipes', label: 'Recipes', icon: BookOpen, match: (p: string) => p.startsWith('/recipes') }
	];
	const path = $derived(page.url.pathname);
</script>

<nav class="tabbar">
	{#each tabs as t (t.href)}
		{@const active = t.match(path)}
		<a href={t.href} class:active aria-current={active ? 'page' : undefined}>
			<t.icon size={22} strokeWidth={active ? 2.4 : 2} />
			<span>{t.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		height: calc(var(--tabbar-h) + var(--safe-b));
		padding-bottom: var(--safe-b);
		background: color-mix(in srgb, var(--surface-1) 88%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-top: 1px solid var(--line);
	}
	.tabbar a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.15rem;
		text-decoration: none;
		color: var(--text-3);
		font-size: var(--fs-cap);
	}
	.tabbar a.active { color: var(--accent); font-weight: var(--fw-head); }
	@media print { .tabbar { display: none; } }
</style>
