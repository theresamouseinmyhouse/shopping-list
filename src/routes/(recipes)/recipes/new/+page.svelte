<script lang="ts">
	import RecipeEditor from '../../RecipeEditor.svelte';
	import Screen from '$lib/nav/Screen.svelte';
	import { emptyRecipeInput } from '$lib/recipe';
	let { data } = $props();
</script>

<svelte:head><title>New recipe</title></svelte:head>

<Screen title="New recipe" back="/recipes">
	<RecipeEditor
		initial={emptyRecipeInput()}
		recipes={data.recipes}
		catalog={data.catalog}
		ai={data.ai}
		action="/recipes/new"
		submitLabel="Create recipe"
	/>
</Screen>
