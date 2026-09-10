<script lang="ts">
	import '$lib/styles/app.css';

	let { children } = $props();
</script>

{@render children?.()}

<style>
	:global(html),
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font: var(--fs-body)/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		overscroll-behavior-y: none;
	}
	:global(*) {
		box-sizing: border-box;
	}
	:global(button) {
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
</style>
