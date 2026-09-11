<script lang="ts">
	let { children } = $props();
</script>

<div class="wrap">
	{@render children?.()}
</div>

<style>
	.wrap {
		padding: 0.5rem 0.7rem calc(var(--tabbar-h) + var(--safe-b) + 0.5rem);
	}

	/* Screen's sticky header/title already carry their own 0.7rem side padding
	   (matching the (app) group, which has none of its own). Here `.wrap` adds a
	   second 0.7rem on top, so the header's --surface-1 bar stops short of the
	   viewport edges and a plain-background strip shows on both sides — bleed it
	   back out so it's flush like every other screen. */
	.wrap :global(.screen-head),
	.wrap :global(.screen-title) {
		margin-left: -0.7rem;
		margin-right: -0.7rem;
	}

	@media print {
		.wrap {
			padding: 0;
		}
	}
</style>
