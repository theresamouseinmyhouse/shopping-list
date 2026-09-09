<script lang="ts">
	import RecipeEditor from '../../RecipeEditor.svelte';
	import { emptyRecipeInput } from '$lib/recipe';
	let { data } = $props();
</script>

<svelte:head><title>New recipe</title></svelte:head>

<div class="rec-topbar">
	<a class="rec-link" href="/recipes">‹ Recipes</a>
	<strong>New recipe</strong>
</div>

<RecipeEditor
	initial={emptyRecipeInput()}
	recipes={data.recipes}
	catalog={data.catalog}
	ai={data.ai}
	action="/recipes/new"
	submitLabel="Create recipe"
/>
