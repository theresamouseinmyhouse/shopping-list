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

	@media print {
		.wrap {
			padding: 0;
		}
	}
</style>
