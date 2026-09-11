<script lang="ts">
	import { untrack } from 'svelte';
	import Screen from '$lib/nav/Screen.svelte';
	let { data, form } = $props();

	const seed = untrack(() => data.ai);
	let enabled = $state(seed.enabled);
	let changingKey = $state(false);
	let apiKey = $state('');
	let model = $state(seed.model);
	let extraInstructions = $state(seed.extraInstructions);

	let current = $state('');
	let next = $state('');
	let confirm = $state('');
</script>

<svelte:head><title>Settings</title></svelte:head>

<Screen title="Settings" back="/">
	<section class="card">
		<h2>AI (Gemini)</h2>
		<p class="hint">
			Powers Recipes → Import (link/photo AI, "Tidy with AI") and "Make one up". Everything else
			in the app works without it.
		</p>
		{#if form?.aiSaved}<p class="ok">Saved.</p>{/if}
		<form method="POST" action="?/ai" class="fields">
			<label class="check">
				<input type="checkbox" name="enabled" bind:checked={enabled} />
				AI features enabled
			</label>

			<label class="field-row">
				<span>Gemini API key</span>
				{#if changingKey}
					<input class="field" name="apiKey" type="password" bind:value={apiKey} placeholder="paste a new key" autocomplete="off" />
				{:else}
					<div class="keyrow">
						<span class="dots">{data.ai.hasKey ? '••••••••••••' : 'not set'}</span>
						<button type="button" class="btn-plain" onclick={() => (changingKey = true)}>change</button>
					</div>
					<input type="hidden" name="apiKey" value="" />
				{/if}
			</label>
			<p class="hint">Leave "change" alone to keep the existing key. To remove one entirely, turn AI off above.</p>

			<label class="field-row">
				<span>Model</span>
				<input class="field" name="model" bind:value={model} placeholder="gemini-2.5-flash" />
			</label>

			<label class="field-row">
				<span>Extra instructions</span>
				<textarea class="field" name="extraInstructions" rows="2" bind:value={extraInstructions}
					placeholder="e.g. always use metric units"></textarea>
			</label>
			<p class="hint">Appended to every AI call — import, tidy, and "Make one up".</p>

			<button class="btn btn-primary">Save AI settings</button>
		</form>
	</section>

	<section class="card">
		<h2>Household password</h2>
		{#if form?.pwSaved}<p class="ok">Password changed.</p>{/if}
		{#if form?.pwError}<p class="err">{form.pwError}</p>{/if}
		<form method="POST" action="?/password" class="fields">
			<label class="field-row">
				<span>Current password</span>
				<input class="field" name="current" type="password" bind:value={current} autocomplete="current-password" required />
			</label>
			<label class="field-row">
				<span>New password</span>
				<input class="field" name="next" type="password" bind:value={next} autocomplete="new-password" required minlength="8" />
			</label>
			<label class="field-row">
				<span>Confirm new password</span>
				<input class="field" name="confirm" type="password" bind:value={confirm} autocomplete="new-password" required minlength="8" />
			</label>
			<button class="btn btn-primary">Change password</button>
		</form>
	</section>
</Screen>

<style>
	.card {
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		padding: 0.9rem;
		margin: 0 0 0.8rem;
	}
	.card h2 {
		margin: 0 0 0.3rem;
		font-size: var(--fs-head);
		font-weight: var(--fw-head);
	}
	.hint {
		margin: 0 0 0.5rem;
		font-size: var(--fs-sub);
		color: var(--text-2);
	}
	.ok {
		color: var(--good);
		font-size: var(--fs-sub);
		margin: 0 0 0.5rem;
	}
	.err {
		color: var(--danger);
		font-size: var(--fs-sub);
		margin: 0 0 0.5rem;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.field-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.field-row > span {
		font-size: var(--fs-sub);
		color: var(--text-2);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--fs-body);
	}
	.keyrow {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.dots {
		font-variant-numeric: tabular-nums;
		color: var(--text-2);
	}
</style>
