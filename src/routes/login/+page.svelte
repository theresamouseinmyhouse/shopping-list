<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const setup = $derived(data.needsSetup);

	let password = $state('');
	let confirm = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = '';

		if (setup) {
			if (password.length < 8) {
				error = 'Use at least 8 characters.';
				return;
			}
			if (password !== confirm) {
				error = 'Passwords don’t match.';
				return;
			}
		}

		busy = true;
		try {
			const res = await fetch(setup ? '/api/setup' : '/api/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password })
			});
			if (res.ok) {
				await goto('/', { invalidateAll: true });
				return;
			}
			const body = await res.json().catch(() => ({}));
			if (res.status === 429) error = 'Too many attempts. Wait a few minutes.';
			else if (body.error === 'too_short') error = 'Use at least 8 characters.';
			else if (body.error === 'already_set') {
				// someone set it first — fall back to the sign-in form
				await goto('/login', { invalidateAll: true });
				return;
			} else if (body.error === 'invalid') error = 'Wrong password.';
			else error = setup ? 'Setup failed.' : 'Login failed.';
		} catch {
			error = 'Network error.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>List — {setup ? 'set up' : 'sign in'}</title></svelte:head>

<main>
	<div class="login-card">
		<form onsubmit={submit}>
			<h1>List</h1>
			{#if setup}
				<p class="lead">Pick a password for this list. Everyone in the household shares it.</p>
				<label>
					New password
					<!-- svelte-ignore a11y_autofocus -->
					<input class="field" type="password" bind:value={password} autocomplete="new-password" autofocus required />
				</label>
				<label>
					Confirm password
					<input class="field" type="password" bind:value={confirm} autocomplete="new-password" required />
				</label>
			{:else}
				<label>
					Password
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="field"
						type="password"
						bind:value={password}
						autocomplete="current-password"
						autofocus
						required
					/>
				</label>
			{/if}
			{#if error}<p class="err">{error}</p>{/if}
			<button type="submit" class="btn btn-primary" disabled={busy}>
				{busy ? '…' : setup ? 'Create password' : 'Sign in'}
			</button>
		</form>
	</div>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 1rem;
	}
	.login-card {
		background: var(--surface-1);
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		padding: 1.2rem;
		max-width: 22rem;
		margin: 4rem auto;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: var(--fs-sub);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		text-align: center;
	}
	.lead {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-3);
		text-align: center;
	}
	.err {
		margin: 0;
		color: var(--danger);
		font-size: 0.85rem;
	}
</style>
