<script lang="ts">
	// One-time nudge to install the PWA. Android/Chrome fires `beforeinstallprompt`;
	// iOS Safari never does, so we show manual instructions there.
	let show = $state(false);
	let deferred: any = null;
	let ios = $state(false);

	function dismissed() {
		try {
			return localStorage.getItem('list.install-dismissed') === '1';
		} catch {
			return true;
		}
	}
	function dismiss() {
		try {
			localStorage.setItem('list.install-dismissed', '1');
		} catch {
			/* ignore */
		}
		show = false;
	}

	$effect(() => {
		if (dismissed()) return;
		const standalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(navigator as any).standalone === true;
		if (standalone) return;

		ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

		const onPrompt = (e: Event) => {
			e.preventDefault();
			deferred = e;
			show = true;
		};
		window.addEventListener('beforeinstallprompt', onPrompt);

		// iOS: show the manual hint after a short delay so it isn't the first thing seen
		let t: ReturnType<typeof setTimeout>;
		if (ios) t = setTimeout(() => (show = true), 1500);

		return () => {
			window.removeEventListener('beforeinstallprompt', onPrompt);
			clearTimeout(t);
		};
	});

	async function install() {
		if (!deferred) return;
		deferred.prompt();
		await deferred.userChoice;
		deferred = null;
		dismiss();
	}
</script>

{#if show}
	<div class="hint">
		{#if ios}
			<span>Add to your Home Screen: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.</span>
			<button class="btn btn-sm" onclick={dismiss}>Got it</button>
		{:else}
			<span>Install List as an app?</span>
			<button class="btn btn-primary" onclick={install}>Install</button>
			<button class="btn btn-sm" onclick={dismiss}>Not now</button>
		{/if}
	</div>
{/if}

<style>
	/* Fixed near the bottom (above the quick-add bar) so it never reflows the list. */
	.hint {
		position: fixed;
		left: 0.5rem;
		right: 0.5rem;
		bottom: calc(var(--kb, 0px) + env(safe-area-inset-bottom, 0px) + 3.6rem);
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.6rem 0.8rem;
		font-size: 0.85rem;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 0.7rem;
	}
	.hint span {
		flex: 1;
		min-width: 12rem;
	}
</style>
