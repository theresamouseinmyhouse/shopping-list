<script lang="ts">
	let { children } = $props();
</script>

{@render children?.()}

<style>
	:global(:root) {
		--bg: #ffffff;
		--surface: #f8fafc;
		--surface-2: #f1f5f9;
		--text: #0f172a;
		--muted: #64748b;
		--line: #e2e8f0;
		--accent: #2563eb;
		--danger: #dc2626;
		color-scheme: light dark;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #0b1120;
			--surface: #111827;
			--surface-2: #1e293b;
			--text: #e5e7eb;
			--muted: #94a3b8;
			--line: #1f2a3c;
			--accent: #3b82f6;
			--danger: #f87171;
		}
	}
	:global(html),
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font: 15px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
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
	:global(.drag-ghost) {
		opacity: 0.4;
	}
</style>
