<script lang="ts">
	import RecipeEditor from '../../RecipeEditor.svelte';
	import Screen from '$lib/nav/Screen.svelte';
	import { hasDualMeasure, displayAmount, type RecipeInput } from '$lib/recipe';
	let { data, form } = $props();

	let url = $state('');
	let text = $state('');

	let draft = $state<RecipeInput | null>(null);
	let choosing = $state(false);
	$effect(() => {
		if (form?.draft && !draft) {
			draft = structuredClone(form.draft as RecipeInput);
			choosing = draft.ingredients.some(hasDualMeasure);
		}
	});

	const methodLabel: Record<string, string> = {
		'json-ld': 'structured data',
		microdata: 'page markup',
		text: 'the page text',
		ai: 'AI'
	};

	const dualSnapshot = $state<{ id: string; name: string; main: string; alt: string }[]>([]);
	$effect(() => {
		if (choosing && draft && !dualSnapshot.length) {
			for (const i of draft.ingredients.filter(hasDualMeasure)) {
				const d = displayAmount(i);
				dualSnapshot.push({ id: i.id, name: i.name, main: d.main, alt: d.alt });
			}
		}
	});
	let picked = $state<Record<string, string>>({});
	const allPicked = $derived(dualSnapshot.every((d) => picked[d.id]));

	function pick(id: string, choice: 'main' | 'alt' | 'both', shown: string) {
		const ing = draft!.ingredients.find((i) => i.id === id);
		if (!ing) return;
		if (choice === 'alt') {
			ing.quantity = ing.quantity2;
			ing.unit = ing.unit2;
		}
		if (choice !== 'both') {
			ing.quantity2 = '';
			ing.unit2 = '';
		}
		ing.preferAlt = false;
		picked[id] = shown;
	}
</script>

<svelte:head><title>Import recipe</title></svelte:head>

<Screen title="Import a recipe" back="/recipes">
{#if draft && choosing}
	<p class="ok">This recipe measures some ingredients two ways. Pick one for each:</p>
	<div class="chooser">
		{#each dualSnapshot as d (d.id)}
			<div class="chooserow">
				<strong>{d.name}</strong>
				<div class="opts">
					{#if picked[d.id]}
						<span class="donev">→ {picked[d.id]}</span>
						<button type="button" class="both" onclick={() => delete picked[d.id]}>change</button>
					{:else}
						<button type="button" onclick={() => pick(d.id, 'main', d.main)}>{d.main}</button>
						<button type="button" onclick={() => pick(d.id, 'alt', d.alt)}>{d.alt}</button>
						<button type="button" class="both" onclick={() => pick(d.id, 'both', `${d.main} (${d.alt})`)}>keep both</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
	<button class="btn btn-sm btn-primary" disabled={!allPicked} onclick={() => (choosing = false)}>Continue to editor</button>
{:else if draft}
	<p class="ok">Read from {methodLabel[form?.method ?? 'text']} — review and save.</p>
	<RecipeEditor
		initial={draft}
		recipes={data.recipes}
		catalog={data.catalog}
		ai={data.ai}
		action="/recipes/new"
		submitLabel="Save recipe"
	/>
{:else}
	{#if form?.error}<p class="err">{form.error}</p>{/if}
	{#if form?.thin}
		<p class="warn">
			Only got a partial recipe from {methodLabel[form?.method ?? 'text']}.
			{#if data.ai}Try AI below, or edit what came through.{:else}Edit what came through, or set an AI key.{/if}
		</p>
	{/if}

	<form method="POST" action="?/url" class="box">
		<h3>From a link</h3>
		<p class="hint">No AI for sites that publish structured recipe data (most do).</p>
		<input class="field" name="url" type="url" placeholder="https://…" bind:value={url} required />
		<div class="btnrow">
			<button class="btn btn-sm btn-primary">Fetch</button>
			{#if data.ai}
				<button class="btn btn-sm" formaction="?/aiUrl">Fetch with AI</button>
			{/if}
		</div>
	</form>

	<form method="POST" action="?/text" class="box">
		<h3>Paste text</h3>
		<p class="hint">Paste an ingredients list + method. Parsed locally, no AI.</p>
		<textarea class="field" name="text" rows="6" bind:value={text} placeholder={'Ingredients\n2 cups flour\n1 tsp salt\n\nMethod\nMix and bake.'}></textarea>
		<div class="btnrow">
			<button class="btn btn-sm btn-primary">Parse</button>
			{#if data.ai}
				<button class="btn btn-sm" formaction="?/aiText">Parse with AI</button>
			{/if}
		</div>
	</form>

	<form method="POST" action="?/photo" enctype="multipart/form-data" class="box">
		<h3>From a photo</h3>
		{#if data.ai}
			<p class="hint">A clear photo of a recipe page or card. Uses AI.</p>
			<input class="field" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
			<button class="btn btn-sm btn-primary">Read photo</button>
		{:else}
			<p class="hint">Needs an AI key (<code>LIST_GEMINI_API_KEY</code>). Not configured.</p>
		{/if}
	</form>
{/if}
</Screen>

<style>
	.box {
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		padding: 0.8rem;
		margin: 0.7rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.box h3 {
		margin: 0;
		font-size: 0.95rem;
	}
	.hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.btnrow {
		display: flex;
		gap: 0.5rem;
	}
	.err {
		background: color-mix(in srgb, var(--danger) 15%, transparent);
		color: var(--danger);
		padding: 0.5rem 0.7rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
	}
	.warn {
		background: var(--surface-2);
		padding: 0.5rem 0.7rem;
		border-radius: 0.5rem;
		font-size: 0.88rem;
	}
	.ok {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.chooser {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0.5rem 0 0.8rem;
	}
	.chooserow {
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		padding: 0.5rem 0.7rem;
	}
	.opts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.35rem;
	}
	.opts button {
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		padding: 0.35rem 0.7rem;
		background: var(--surface);
		color: inherit;
		font: inherit;
	}
	.opts .both {
		color: var(--muted);
	}
	.opts .donev {
		padding: 0.35rem 0;
		font-weight: 600;
	}
</style>
