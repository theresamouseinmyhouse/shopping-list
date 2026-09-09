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
	:global(.rec-topbar) {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
		margin-bottom: 0.8rem;
	}
	:global(.rec-topbar .spacer) {
		flex: 1;
	}
	:global(.rec-link) {
		color: var(--accent);
		text-decoration: none;
		font-size: 0.9rem;
	}
	:global(.rec-btn) {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		padding: 0.4rem 0.7rem;
		font-size: 0.88rem;
		color: var(--text);
	}
	:global(.rec-btn.primary) {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	:global(.rec-btn.danger) {
		color: var(--danger);
	}
	:global(.rec-input),
	:global(.rec-textarea) {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
		color: inherit;
		font: inherit;
	}
	:global(.rec-textarea) {
		resize: vertical;
		min-height: 3rem;
	}

	@media print {
		.wrap {
			padding: 0;
		}
	}
</style>
