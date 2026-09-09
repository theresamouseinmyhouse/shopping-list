<script lang="ts">
	import RecipeEditor from '../../../RecipeEditor.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Edit {data.initial.title}</title></svelte:head>

<div class="rec-topbar">
	<a class="rec-link" href={`/recipes/${data.id}`}>‹ Back</a>
	<strong>Edit recipe</strong>
</div>

<RecipeEditor
	initial={data.initial}
	recipes={data.recipes}
	catalog={data.catalog}
	ai={data.ai}
	action={`/recipes/${data.id}/edit`}
	submitLabel="Save changes"
/>
