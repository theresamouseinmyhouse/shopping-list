<script lang="ts">
	import { normalizeName } from '$lib/types';

	interface Suggestion {
		name: string;
		on_list: boolean;
	}

	let {
		suggestions,
		onAdd,
		boxed = false,
		dropUp = false,
		placeholder = '+ Add item'
	}: {
		suggestions: Suggestion[];
		onAdd: (name: string) => void;
		boxed?: boolean;
		dropUp?: boolean;
		placeholder?: string;
	} = $props();

	let value = $state('');
	let focused = $state(false);
	let active = $state(-1);
	let inputEl = $state<HTMLInputElement>();

	const matches = $derived.by(() => {
		const q = value.trim().toLowerCase();
		if (!q) return [];
		const qn = normalizeName(value);
		return suggestions
			.filter((s) => s.name.toLowerCase().includes(q) && normalizeName(s.name) !== qn)
			.sort((a, b) => {
				const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
				const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
				return as - bs || a.name.localeCompare(b.name);
			})
			.slice(0, 6);
	});

	const open = $derived(focused && matches.length > 0);

	function commit(name: string) {
		const n = name.trim();
		if (n) onAdd(n);
		value = '';
		active = -1;
		inputEl?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commit(active >= 0 && matches[active] ? matches[active].name : value);
		} else if (e.key === 'ArrowDown' && open) {
			e.preventDefault();
			active = (active + 1) % matches.length;
		} else if (e.key === 'ArrowUp' && open) {
			e.preventDefault();
			active = active <= 0 ? matches.length - 1 : active - 1;
		} else if (e.key === 'Escape') {
			focused = false;
			active = -1;
		}
	}
</script>

<div class="box">
	<input
		class:boxed
		bind:this={inputEl}
		bind:value
		{placeholder}
		enterkeyhint="done"
		autocomplete="off"
		onfocus={() => (focused = true)}
		onblur={() => setTimeout(() => (focused = false), 120)}
		onkeydown={onKeydown}
		oninput={() => (active = -1)}
	/>
	{#if open}
		<ul class="menu" class:up={dropUp}>
			{#each matches as m, i (m.name)}
				<li>
					<button
						type="button"
						class:active={i === active}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => commit(m.name)}
					>
						<span>{m.name}</span>
						{#if m.on_list}<span class="hint">on list</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.box {
		position: relative;
	}
	input {
		width: 100%;
		padding: 0.55rem 0.5rem;
		border: 0;
		border-bottom: 1px solid transparent;
		background: transparent;
		color: var(--muted);
		font-size: 0.95rem;
	}
	input:focus {
		outline: none;
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	input.boxed {
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		background: var(--bg);
		color: var(--text);
		padding: 0.7rem 0.8rem;
		font-size: 1rem;
	}
	input.boxed:focus {
		border-color: var(--accent);
	}
	.menu {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		z-index: 30;
		margin: 0.2rem 0 0;
		max-height: 40vh;
		overflow-y: auto;
	}
	.menu.up {
		top: auto;
		bottom: 100%;
		margin: 0 0 0.35rem;
		padding: 0.25rem;
		list-style: none;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
	}
	.menu button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		text-align: left;
		background: none;
		border: 0;
		padding: 0.55rem 0.5rem;
		border-radius: 0.4rem;
		font-size: 0.95rem;
	}
	.menu button.active,
	.menu button:hover {
		background: var(--surface-2);
	}
	.hint {
		font-size: 0.7rem;
		color: var(--muted);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
	}
</style>
