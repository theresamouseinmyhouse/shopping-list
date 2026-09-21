// One-time cleanup: re-run every existing recipe through the updated AI tidy
// pass so it picks up the new @ingredient/~timer/--comment token grammar.
// Usage: LIST_DB_PATH=./data/list.db npx vite-node -c vite.config.scripts.ts scripts/reparse-recipes-to-tokens.ts
//
// Back up list.db before running this against a real database — it rewrites
// every recipe row. (Notes and the is_prep flag are now preserved across the
// AI tidy pass; this is about the AI rewrite itself, not a known data-loss bug.)
//
// Must run under vite-node, not tsx/ts-node: src/lib/server/migrations.ts
// imports the migration .sql files with a Vite-only `?raw` specifier, which
// plain Node module resolution cannot handle.
//
// Must use `-c vite.config.scripts.ts` (not the root vite.config.ts): the
// root config's SvelteKit plugin narrows server.fs.allow to src/lib,
// src/routes, node_modules, etc, which blocks vite-node's SSR transform from
// reading migrations/*.sql?raw (outside src) and fails with "Denied ID".
import { openDb } from '../src/lib/server/db';
import { listRecipes, getRecipe, fullRecipeToInput, saveRecipe } from '../src/lib/server/recipes';
import { tidyRecipe } from '../src/lib/server/recipe-import';

async function main() {
	const dbPath = process.env.LIST_DB_PATH;
	if (!dbPath) throw new Error('Set LIST_DB_PATH to the target list.db file.');
	const db = openDb(dbPath);

	const rows = listRecipes(db);
	console.log(`Reparsing ${rows.length} recipes...`);
	for (const row of rows) {
		const full = getRecipe(db, row.id);
		if (!full) continue;
		const input = fullRecipeToInput(db, full);
		try {
			const tidied = await tidyRecipe(db, input, '');
			saveRecipe(db, row.id, { ...tidied, notes: input.notes, is_prep: input.is_prep });
			console.log(`  ok: ${row.title}`);
		} catch (e) {
			console.error(`  FAILED: ${row.title} — ${e instanceof Error ? e.message : e}`);
		}
	}
	console.log('Done.');
}

main();
