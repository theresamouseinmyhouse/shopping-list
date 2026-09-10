<script lang="ts">
	import RecipeEditor from '../../../RecipeEditor.svelte';
	import Screen from '$lib/nav/Screen.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Edit {data.initial.title}</title></svelte:head>

<Screen title="Edit recipe" back={`/recipes/${data.id}`}>
	<RecipeEditor
		initial={data.initial}
		recipes={data.recipes}
		catalog={data.catalog}
		ai={data.ai}
		action={`/recipes/${data.id}/edit`}
		submitLabel="Save changes"
	/>
</Screen>
