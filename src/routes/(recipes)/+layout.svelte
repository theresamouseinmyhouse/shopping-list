<script lang="ts">
	let { children } = $props();
</script>

<div class="wrap">
	{@render children?.()}
</div>

<style>
	.wrap {
		padding: 0.5rem 0.7rem 4rem;
	}
	:global(.rec-topbar) { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.4rem 0; border-bottom: 1px solid var(--line); margin-bottom: 0.8rem; }
	:global(.rec-topbar .spacer) { flex: 1; }
	:global(.rec-link) { color: var(--accent); text-decoration: none; font-size: var(--fs-sub); }

	@media print {
		.wrap {
			padding: 0;
		}
	}
</style>
