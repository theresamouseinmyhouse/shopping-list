# Cooklang-derivative Recipe Tokens + Prep Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fuzzy step↔ingredient matching in `list`'s recipes with exact, explicit links via inline Cooklang-derivative tokens (`@name{qty%unit}`, `~{duration}`, trailing `-- comment`), add a TinyMCE-like annotate-in-place editor for authoring them without hand-typing syntax, rewrite the AI import prompts to emit tokens directly, and add an `is_prep` flag + a prep/cook-day screen for planning weekend batch-cook sessions.

**Architecture:** No DB schema change for the token model — `recipe_steps.body` keeps storing plain text, now with tokens embedded inline; `recipe_ingredients` rows become *derived* from those tokens at parse/save time instead of solely hand-authored. One shared tokenizer (`tokenizeStepBody`) powers linking (save time), rendering (the recipe view), and the new editor (live chip display + round-trip serialization). `is_prep` is the one real schema addition, following the existing `items.is_staple` boolean pattern.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), better-sqlite3, existing recipe module (`src/lib/recipe.ts`, `src/lib/recipe-parse.ts`, `src/lib/server/recipes.ts`, `src/lib/server/recipe-import.ts`).

**Spec:** `docs/superpowers/specs/2026-09-21-cooklang-recipe-tokens-design.md`

## Global Constraints

- No Playwright MCP browser tools, ever, for this project (hard rule, raised 3+ times by the user). Verification is `npm run check` + `npm run test:unit -- --run` + `npm run build`; a headless `npx playwright test` run at most once at the very end of the whole plan, not per task. Visual/interaction checks are deployed to `listapp-dev` (port 2121) for the user to look at by hand — never drive a browser from this plan.
- Token grammar (exact, from the spec — do not deviate):
  - `@name` — bare ingredient reference, single word only (no spaces without braces).
  - `@name{}` or `@name{qty%unit}` — braced ingredient reference; `name` may contain spaces/hyphens/apostrophes. Empty braces = no quantity.
  - `@name{qty%unit|qty2%unit2}` — dual measure (list-specific extension of Cooklang's own grammar).
  - `~{qty%unit}` — anonymous timer. `~label{qty%unit}` — named timer.
  - `-- comment` — trailing note. Recognized **only** as a suffix of the step (the last ` -- ` in the trimmed body), never mid-sentence.
  - `## Group heading` (line-start) and `+ Recipe Title` (line-start) are **unchanged** — do not touch their existing regexes (`groupHeader`, the `/^\+\s*/` checks) in `src/lib/recipe-parse.ts`.
- `RecipeInput`/`RecipeIngredient`/`RecipeStep`/`ResolvedRecipe` shapes in `src/lib/recipe.ts` do not change (no new fields) except: `RecipeInput.is_prep: boolean` and `ResolvedRecipe`/`RecipeRow` gain the same field (Task 5 only).
- Every task that touches parsing/linking logic must keep `matchIngredientsInProse` intact and still called as a fallback in `saveRecipe` — it is not being deleted, only supplemented (non-AI import paths — JSON-LD, microdata, pasted text — never carry tokens and still rely on it).
- No new npm dependency for the editor (Task 8/9) — contenteditable + the DOM Selection API only, matching this codebase's existing "no WYSIWYG library" decision.
- Windows/Git Bash: prefix any `docker`/path-bearing command with `MSYS_NO_PATHCONV=1` per this host's documented gotcha (not usually needed inside this plan's tasks, which are pure `npm`/`git`, but flagged for the deploy step at the end).

---

### Task 1: Token parser — `tokenizeStepBody`

**Files:**
- Modify: `src/lib/recipe-parse.ts`
- Test: `src/lib/recipe-parse.test.ts`

**Interfaces:**
- Produces (used by every later task):
  ```ts
  export type StepSegment =
    | { type: 'text'; text: string }
    | { type: 'ingredient'; name: string; quantity: string; unit: string; quantity2: string; unit2: string }
    | { type: 'timer'; label: string; quantity: string; unit: string }
    | { type: 'comment'; text: string };

  export function tokenizeStepBody(body: string): StepSegment[];
  ```
  Segments appear in left-to-right order and their `text`/token content, concatenated back together (ignoring type), reconstructs the original body minus the `@{}`/`~{}` token punctuation — i.e. this is a lossless walk of the string, not a lossy strip.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/recipe-parse.test.ts`:

```ts
import { tokenizeStepBody } from './recipe-parse';

describe('tokenizeStepBody', () => {
  it('splits plain text with no tokens into one text segment', () => {
    expect(tokenizeStepBody('Preheat the oven.')).toEqual([
      { type: 'text', text: 'Preheat the oven.' }
    ]);
  });

  it('parses a braced ingredient token with quantity and unit', () => {
    const segs = tokenizeStepBody('Fry @pancetta{200%g} until crispy.');
    expect(segs).toEqual([
      { type: 'text', text: 'Fry ' },
      { type: 'ingredient', name: 'pancetta', quantity: '200', unit: 'g', quantity2: '', unit2: '' },
      { type: 'text', text: ' until crispy.' }
    ]);
  });

  it('parses a bare single-word ingredient token with no braces', () => {
    const segs = tokenizeStepBody('Season with @salt.');
    expect(segs).toEqual([
      { type: 'text', text: 'Season with ' },
      { type: 'ingredient', name: 'salt', quantity: '', unit: '', quantity2: '', unit2: '' },
      { type: 'text', text: '.' }
    ]);
  });

  it('parses a multi-word braced ingredient name', () => {
    const segs = tokenizeStepBody('Add @ground beef{1%lb}.');
    expect(segs[1]).toEqual({
      type: 'ingredient', name: 'ground beef', quantity: '1', unit: 'lb', quantity2: '', unit2: ''
    });
  });

  it('parses a dual-measure ingredient token', () => {
    const segs = tokenizeStepBody('Whisk in @flour{1.5%cups|190%g}.');
    expect(segs[1]).toEqual({
      type: 'ingredient', name: 'flour', quantity: '1.5', unit: 'cups', quantity2: '190', unit2: 'g'
    });
  });

  it('parses an anonymous timer', () => {
    const segs = tokenizeStepBody('Add garlic for ~{30%seconds}.');
    expect(segs[1]).toEqual({ type: 'timer', label: '', quantity: '30', unit: 'seconds' });
  });

  it('parses a named timer', () => {
    const segs = tokenizeStepBody('Let it ~simmer{45%minutes} on low.');
    expect(segs[1]).toEqual({ type: 'timer', label: 'simmer', quantity: '45', unit: 'minutes' });
  });

  it('recognizes a trailing comment at the end of the step only', () => {
    const segs = tokenizeStepBody('Simmer beans until tender. -- canned beans work too');
    expect(segs).toEqual([
      { type: 'text', text: 'Simmer beans until tender.' },
      { type: 'comment', text: 'canned beans work too' }
    ]);
  });

  it('does not treat a mid-sentence " -- " as a comment when more text follows', () => {
    // "-- " only counts as a comment when it is the LAST such marker in the body
    const segs = tokenizeStepBody('Do this -- carefully -- then that.');
    expect(segs.filter((s) => s.type === 'comment')).toEqual([{ type: 'comment', text: 'then that.' }]);
  });

  it('handles a step with an ingredient, a timer, and a trailing comment together', () => {
    const segs = tokenizeStepBody(
      'Fry @pancetta{200%g} until crispy, then add @garlic{2%cloves} for ~{30%seconds}. -- watch it, garlic burns fast'
    );
    expect(segs.map((s) => s.type)).toEqual([
      'text', 'ingredient', 'text', 'ingredient', 'text', 'timer', 'text', 'comment'
    ]);
    expect(segs[segs.length - 1]).toEqual({ type: 'comment', text: 'watch it, garlic burns fast' });
  });

  it('ignores an empty-braced ingredient token (no quantity)', () => {
    const segs = tokenizeStepBody('Season the @chicken breast{}.');
    expect(segs[1]).toEqual({
      type: 'ingredient', name: 'chicken breast', quantity: '', unit: '', quantity2: '', unit2: ''
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- --run recipe-parse`
Expected: FAIL — `tokenizeStepBody is not a function`.

- [ ] **Step 3: Implement `tokenizeStepBody`**

Add to `src/lib/recipe-parse.ts` (near the other exports, after `parseMethod`):

```ts
export type StepSegment =
	| { type: 'text'; text: string }
	| { type: 'ingredient'; name: string; quantity: string; unit: string; quantity2: string; unit2: string }
	| { type: 'timer'; label: string; quantity: string; unit: string }
	| { type: 'comment'; text: string };

const TOKEN_RE =
	/@([a-zA-Z][\w' -]*?)\{([^}]*)\}|@([a-zA-Z][\w'-]*)|~([a-zA-Z][\w' -]*)?\{([^}]*)\}/g;

function splitQtyUnit(inner: string): { q: string; u: string } {
	const t = inner.trim();
	if (!t) return { q: '', u: '' };
	const i = t.indexOf('%');
	return i < 0 ? { q: t, u: '' } : { q: t.slice(0, i).trim(), u: t.slice(i + 1).trim() };
}

/** Split a `body` string into an ordered walk of plain text / `@ingredient` /
 *  `~timer` / trailing `-- comment` segments. Lossless over the non-token text. */
export function tokenizeStepBody(body: string): StepSegment[] {
	// a trailing " -- comment" (the LAST such marker) is pulled off before
	// tokenizing the rest, so "--" inside earlier text is never mistaken for one
	let core = body;
	let comment = '';
	const cIdx = body.lastIndexOf(' -- ');
	if (cIdx >= 0) {
		core = body.slice(0, cIdx).trimEnd();
		comment = body.slice(cIdx + 4).trim();
	}

	const out: StepSegment[] = [];
	let last = 0;
	TOKEN_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = TOKEN_RE.exec(core))) {
		if (m.index > last) out.push({ type: 'text', text: core.slice(last, m.index) });
		if (m[1] !== undefined) {
			// braced ingredient: @name{inner}
			const { q, u } = splitQtyUnitMain(m[2]);
			out.push({ type: 'ingredient', name: m[1].trim(), quantity: q.quantity, unit: q.unit, quantity2: u.quantity, unit2: u.unit });
		} else if (m[3] !== undefined) {
			// bare ingredient: @name
			out.push({ type: 'ingredient', name: m[3].trim(), quantity: '', unit: '', quantity2: '', unit2: '' });
		} else {
			// timer: ~label?{inner}
			const { q } = splitQtyUnitMain(m[5]);
			out.push({ type: 'timer', label: (m[4] ?? '').trim(), quantity: q.quantity, unit: q.unit });
		}
		last = TOKEN_RE.lastIndex;
	}
	if (last < core.length) out.push({ type: 'text', text: core.slice(last) });
	if (comment) out.push({ type: 'comment', text: comment });
	return out;
}

/** `"200%g"` -> main; `"1.5%cups|190%g"` -> main + alt (dual measure). */
function splitQtyUnitMain(inner: string): {
	q: { quantity: string; unit: string };
	u: { quantity: string; unit: string };
} {
	const [mainRaw, altRaw] = inner.split('|');
	const main = splitQtyUnit(mainRaw ?? '');
	const alt = splitQtyUnit(altRaw ?? '');
	return { q: { quantity: main.q, unit: main.u }, u: { quantity: alt.q, unit: alt.u } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- --run recipe-parse`
Expected: PASS, all `tokenizeStepBody` cases green.

- [ ] **Step 5: Run full check + commit**

Run: `npm run check`
Expected: 0 errors, 0 warnings.

```bash
git add src/lib/recipe-parse.ts src/lib/recipe-parse.test.ts
git commit -m "Add tokenizeStepBody: parse inline @ingredient/~timer/--comment tokens"
```

---

### Task 2: Ingredient linking from tokens — `linkStepIngredients`

**Files:**
- Modify: `src/lib/recipe.ts`
- Test: `src/lib/recipe.test.ts`

**Interfaces:**
- Consumes: `StepSegment`, `tokenizeStepBody` from Task 1 (`./recipe-parse` — note this creates a `recipe.ts` → `recipe-parse.ts` import; `recipe-parse.ts` already imports from `./recipe`, so **put `linkStepIngredients` in `recipe.ts` and have it call a function passed in**, avoiding a circular import — see Step 3 below for the exact resolution).
- Produces (used by Task 3, Task 4, Task 10):
  ```ts
  export function linkStepIngredients(
    otherIngredients: RecipeIngredient[],
    steps: RecipeStep[]
  ): { ingredients: RecipeIngredient[]; steps: RecipeStep[] };
  ```
  Returns a new ingredient list (input ingredients plus any newly discovered from `@` tokens, deduped by `normalizeName`) and new step objects whose `ingredientIds` include every token-referenced ingredient's id (merged with whatever `ingredientIds` already held).

- [ ] **Step 1: Resolve the import direction (read, no code change)**

`src/lib/recipe-parse.ts` already has `import { blankIngredient, blankStep, emptyRecipeInput, type RecipeIngredient, type RecipeInput } from './recipe';` at its top. To avoid a cycle, `linkStepIngredients` must live in **`recipe-parse.ts`**, not `recipe.ts`, since it needs `tokenizeStepBody` (same file, no import needed) and only needs types from `recipe.ts` (already imported there). Ignore the file path in "Files" above — put it in `src/lib/recipe-parse.ts`, and put its test cases in `src/lib/recipe-parse.test.ts` instead of `recipe.test.ts`.

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/recipe-parse.test.ts`:

```ts
import { linkStepIngredients } from './recipe-parse';
import { blankIngredient, blankStep } from './recipe';

describe('linkStepIngredients', () => {
  it('creates a new canonical ingredient from a token not in the input list', () => {
    const steps = [{ ...blankStep(), body: 'Fry @pancetta{200%g} until crispy.' }];
    const { ingredients, steps: out } = linkStepIngredients([], steps);
    expect(ingredients).toHaveLength(1);
    expect(ingredients[0]).toMatchObject({ name: 'pancetta', quantity: '200', unit: 'g' });
    expect(out[0].ingredientIds).toEqual([ingredients[0].id]);
  });

  it('reuses an existing ingredient by normalized name instead of duplicating it', () => {
    const existing = { ...blankIngredient(), name: 'Pancetta', quantity: '', unit: '' };
    const steps = [{ ...blankStep(), body: 'Add @pancetta{200%g} to the pan.' }];
    const { ingredients, steps: out } = linkStepIngredients([existing], steps);
    expect(ingredients).toHaveLength(1);
    expect(ingredients[0].id).toBe(existing.id);
    expect(out[0].ingredientIds).toEqual([existing.id]);
  });

  it('links the same ingredient across multiple steps to one canonical row', () => {
    const steps = [
      { ...blankStep(), body: 'Fry @pancetta{200%g}.' },
      { ...blankStep(), body: 'Add the crispy @pancetta back in.' }
    ];
    const { ingredients, steps: out } = linkStepIngredients([], steps);
    expect(ingredients).toHaveLength(1);
    expect(out[0].ingredientIds).toEqual([ingredients[0].id]);
    expect(out[1].ingredientIds).toEqual([ingredients[0].id]);
  });

  it('preserves ingredients from the "other ingredients" list that no step mentions', () => {
    const cookingSpray = { ...blankIngredient(), name: 'cooking spray' };
    const { ingredients } = linkStepIngredients([cookingSpray], [{ ...blankStep(), body: 'Bake it.' }]);
    expect(ingredients).toEqual([cookingSpray]);
  });

  it('keeps pre-existing explicit ingredientIds on a step alongside token-derived ones', () => {
    const existing = { ...blankIngredient(), name: 'salt' };
    const steps = [{ ...blankStep(), body: 'Add @pepper{1%tsp}.', ingredientIds: [existing.id] }];
    const { steps: out } = linkStepIngredients([existing], steps);
    expect(out[0].ingredientIds).toEqual(expect.arrayContaining([existing.id]));
    expect(out[0].ingredientIds).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit -- --run recipe-parse`
Expected: FAIL — `linkStepIngredients is not a function`.

- [ ] **Step 4: Implement `linkStepIngredients`**

Add to `src/lib/recipe-parse.ts`, after `tokenizeStepBody`:

```ts
import { normalizeName } from './types';
import { canonicalizeUnit } from './units';

/** Merge `@token`-declared ingredients (found in step bodies) into the canonical
 *  ingredient list, and populate each step's `ingredientIds` from those tokens —
 *  merged with whatever explicit ids the step already carried. Ingredients that
 *  no step mentions (the "other ingredients" block) pass through untouched. */
export function linkStepIngredients(
	otherIngredients: RecipeIngredient[],
	steps: RecipeInput['steps']
): { ingredients: RecipeIngredient[]; steps: RecipeInput['steps'] } {
	const working = [...otherIngredients];
	const byNorm = new Map(working.map((i) => [normalizeName(i.name), i]));

	const outSteps = steps.map((s) => {
		const tokenIds: string[] = [];
		for (const seg of tokenizeStepBody(s.body)) {
			if (seg.type !== 'ingredient') continue;
			const key = normalizeName(seg.name);
			if (!key) continue;
			let ing = byNorm.get(key);
			if (!ing) {
				ing = {
					...blankIngredient(),
					name: seg.name,
					quantity: seg.quantity,
					unit: canonicalizeUnit(seg.unit),
					quantity2: seg.quantity2,
					unit2: canonicalizeUnit(seg.unit2),
					group: s.group
				};
				working.push(ing);
				byNorm.set(key, ing);
			}
			tokenIds.push(ing.id);
		}
		return { ...s, ingredientIds: [...new Set([...s.ingredientIds, ...tokenIds])] };
	});

	return { ingredients: working, steps: outSteps };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- --run recipe-parse`
Expected: PASS.

- [ ] **Step 6: Run full check + commit**

Run: `npm run check`
Expected: 0 errors, 0 warnings.

```bash
git add src/lib/recipe-parse.ts src/lib/recipe-parse.test.ts
git commit -m "Add linkStepIngredients: derive canonical ingredients + links from @ tokens"
```

---

### Task 3: Wire token linking into `parsePlainRecipe`

**Files:**
- Modify: `src/lib/recipe-parse.ts`
- Test: `src/lib/recipe-parse.test.ts`

**Interfaces:**
- Consumes: `linkStepIngredients` (Task 2), `parsePlainRecipe`'s existing internals (`parseIngredientsBlock`, `parseMethod`).
- Produces: `parsePlainRecipe(text)` now returns a `RecipeInput` whose `ingredients`/`steps[].ingredientIds` already reflect any `@`/`~` tokens present in the method text — used directly by every AI import path (Task 11) and by pasted-text import.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/recipe-parse.test.ts`:

```ts
describe('parsePlainRecipe with inline tokens', () => {
  it('links an ingredient declared only via an inline @ token in the method', () => {
    const text = `Title: Carbonara

@ingredients
400 g spaghetti

@method
Fry @pancetta{200%g} until crispy, then toss with the spaghetti.`;
    const draft = parsePlainRecipe(text);
    const pancetta = draft.ingredients.find((i) => i.name === 'pancetta');
    expect(pancetta).toBeTruthy();
    expect(pancetta?.quantity).toBe('200');
    expect(pancetta?.unit).toBe('g');
    expect(draft.steps[0].ingredientIds).toContain(pancetta!.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- --run recipe-parse`
Expected: FAIL — pancetta not found in `draft.ingredients` (today's `parsePlainRecipe` never reads step bodies for ingredients).

- [ ] **Step 3: Wire `linkStepIngredients` into `parsePlainRecipe`**

In `src/lib/recipe-parse.ts`, find the end of `parsePlainRecipe` (currently):

```ts
	const ingParsed = parseIngredientsBlock(ingredientText);
	out.ingredients = ingParsed.ingredients;
	const method = parseMethod(methodText);
	out.steps = method.steps;
	out.miseEnPlaceIncludes = [...ingParsed.includes, ...method.leadingIncludes];
	return out;
```

Replace with:

```ts
	const ingParsed = parseIngredientsBlock(ingredientText);
	const method = parseMethod(methodText);
	const linked = linkStepIngredients(ingParsed.ingredients, method.steps);
	out.ingredients = linked.ingredients;
	out.steps = linked.steps;
	out.miseEnPlaceIncludes = [...ingParsed.includes, ...method.leadingIncludes];
	return out;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- --run recipe-parse`
Expected: PASS. Also re-run the full suite (`npm run test:unit -- --run`) to confirm no existing `parsePlainRecipe`/`parseIngredientText` test regressed — token linking is additive and should not change output for bodies with no `@`/`~` tokens.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipe-parse.ts src/lib/recipe-parse.test.ts
git commit -m "Wire linkStepIngredients into parsePlainRecipe"
```

---

### Task 4: Wire token linking into `saveRecipe`

**Files:**
- Modify: `src/lib/server/recipes.ts`
- Test: `src/lib/server/recipes.test.ts`

**Interfaces:**
- Consumes: `linkStepIngredients` from `../recipe-parse` (Task 2).
- Produces: `saveRecipe` persists ingredients discovered via `@` tokens even when the caller (e.g. a direct API/import action) didn't already run them through `linkStepIngredients` client-side. Defense in depth — idempotent when the input is already linked.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/server/recipes.test.ts` (using the file's existing `openDb(':memory:')` + `saveRecipe`/`getRecipe` pattern — read the top of that file first for the exact helper names in scope before writing this):

```ts
it('saveRecipe derives and links an ingredient declared only via an inline @ token', () => {
  const id = saveRecipe(db, null, {
    ...emptyRecipeInput(),
    title: 'Carbonara',
    steps: [{ ...blankStep(), body: 'Fry @pancetta{200%g} until crispy.' }]
  });
  const full = getRecipe(db, id)!;
  expect(full.ingredients.map((i) => i.name)).toContain('pancetta');
  const pancettaRow = full.ingredients.find((i) => i.name === 'pancetta')!;
  expect(full.stepIngredients.map((si) => si.ingredient_id)).toContain(pancettaRow.id);
});
```

(Import `emptyRecipeInput`/`blankStep` from `../recipe` at the top of the test file if not already imported.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- --run recipes.test`
Expected: FAIL — pancetta never gets inserted into `recipe_ingredients` today (the `saveRecipe` shown at plan-writing time only iterates `input.ingredients`, which is empty here).

- [ ] **Step 3: Wire linking into `saveRecipe`**

In `src/lib/server/recipes.ts`, add the import:

```ts
import { linkStepIngredients } from '../recipe-parse';
```

At the top of `saveRecipe`, right after `const titleNorm = normalizeName(input.title);`, add:

```ts
	const linked = linkStepIngredients(input.ingredients, input.steps);
	input = { ...input, ingredients: linked.ingredients, steps: linked.steps };
```

(`input` is a function parameter — reassigning it is fine in this function's scope; every later reference to `input.ingredients`/`input.steps` in the existing transaction body now sees the linked versions, so no other line in `saveRecipe` needs to change. The existing `matchIngredientsInProse` fuzzy-match call inside the transaction stays exactly as is — it still runs afterward and simply finds nothing new for token-declared ingredients since they're already linked via `s.ingredientIds`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- --run recipes.test`
Expected: PASS. Also run the full server test suite (`npm run test:unit -- --run`) to confirm no regression in existing save/get round-trip tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/recipes.ts src/lib/server/recipes.test.ts
git commit -m "saveRecipe: derive + persist ingredients from inline @ tokens"
```

---

### Task 5: `is_prep` flag

**Files:**
- Create: `migrations/0008_recipe_prep.sql`
- Modify: `src/lib/server/migrations.ts`, `src/lib/recipe.ts`, `src/lib/server/recipes.ts`, `src/routes/(recipes)/RecipeEditor.svelte`, `src/routes/(recipes)/recipes/+page.server.ts`, `src/routes/(recipes)/recipes/+page.svelte`, `src/routes/(recipes)/recipes/new/+page.server.ts`, `src/routes/(recipes)/recipes/[id]/edit/+page.server.ts`
- Test: `src/lib/server/recipes.test.ts`

**Interfaces:**
- Produces: `RecipeInput.is_prep: boolean`, `listRecipes(db)` rows gain `is_prep`, `saveRecipe` persists it, a `listPrepRecipes(db)` export for Task 12.

- [ ] **Step 1: Write the migration**

Create `migrations/0008_recipe_prep.sql`:

```sql
ALTER TABLE recipes ADD COLUMN is_prep INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Register the migration**

In `src/lib/server/migrations.ts`, add the import alongside the existing `m0007` line:

```ts
import m0008 from '../../../migrations/0008_recipe_prep.sql?raw';
```

Then add `m0008` to the end of the `MIGRATIONS` array (read the file first to match its exact array literal syntax before editing).

- [ ] **Step 3: Write the failing test**

Add to `src/lib/server/recipes.test.ts`:

```ts
it('is_prep round-trips through save and get, defaulting to false', () => {
  const id1 = saveRecipe(db, null, { ...emptyRecipeInput(), title: 'Everyday Chili' });
  expect(getRecipe(db, id1)!.recipe.is_prep).toBe(0);

  const id2 = saveRecipe(db, null, { ...emptyRecipeInput(), title: 'Batch Beans', is_prep: true });
  expect(getRecipe(db, id2)!.recipe.is_prep).toBe(1);
});

it('listPrepRecipes returns only is_prep recipes', () => {
  saveRecipe(db, null, { ...emptyRecipeInput(), title: 'Everyday Chili' });
  const id = saveRecipe(db, null, { ...emptyRecipeInput(), title: 'Batch Beans', is_prep: true });
  const rows = listPrepRecipes(db);
  expect(rows.map((r) => r.id)).toEqual([id]);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:unit -- --run recipes.test`
Expected: FAIL — `is_prep` unknown on `RecipeInput`, `listPrepRecipes` not exported.

- [ ] **Step 5: Add `is_prep` to the recipe types and CRUD**

In `src/lib/recipe.ts`:
- Add `is_prep: boolean;` to `RecipeInput` (after `source_url`).
- Add `is_prep: false,` to `emptyRecipeInput()`'s return object.
- Add `is_prep: boolean;` to `ResolvedRecipe`.
- In `coerceRecipeInput`, add `is_prep: !!o.is_prep,` to the returned object.

In `src/lib/server/recipes.ts`:
- Add `is_prep: 0 | 1;` to `RecipeRow`.
- In `saveRecipe`, both the `UPDATE recipes SET ...` and `INSERT INTO recipes (...)` statements gain `is_prep = ?` / an `is_prep` column and `?` placeholder, with `input.is_prep ? 1 : 0` appended to that statement's bound-parameter list (in column order — insert it right after `source_url`'s bound value in both statements).
- In `fullRecipeToInput`, add `is_prep: !!full.recipe.is_prep,` to the returned object.
- In `resolveRecipeTree`'s returned object, add `is_prep: !!full.recipe.is_prep,`.
- Add a new export:
  ```ts
  export function listPrepRecipes(db: DB): { id: string; title: string; servings: string }[] {
  	return db
  		.prepare(
  			`SELECT id, title, servings FROM recipes WHERE deleted_at IS NULL AND is_prep = 1
  			 ORDER BY title COLLATE NOCASE`
  		)
  		.all() as { id: string; title: string; servings: string }[];
  }
  ```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit -- --run recipes.test`
Expected: PASS. Run the full unit suite too — `coerceRecipeInput`/`saveRecipe` callers elsewhere (`recipes/new/+page.server.ts`, `recipes/[id]/edit/+page.server.ts`) build a `RecipeInput` from form JSON via `coerceRecipeInput`, so they pick up `is_prep` automatically; no change needed there beyond what Step 7 adds to the editor UI.

- [ ] **Step 7: Add the checkbox to the editor**

In `src/routes/(recipes)/RecipeEditor.svelte`:
- Add `let isPrep = $state(seed.is_prep);` alongside the other `$state` seeds (near `let sourceUrl`).
- Add `is_prep: isPrep,` to the `payload` `$derived` object.
- In the template, add a checkbox near the Servings/Source URL row:
  ```svelte
  <label class="fieldrow chk">
  	<input type="checkbox" bind:checked={isPrep} />
  	<span>Weekend batch-prep recipe</span>
  </label>
  ```
  Add a small `.chk { flex-direction: row; align-items: center; gap: 0.4rem; }` rule to the `<style>` block.

- [ ] **Step 8: Add a filter chip to `/recipes`**

Read `src/routes/(recipes)/recipes/+page.server.ts` and `+page.svelte` first to match their existing structure, then: have `load` also return `prepRecipes: listPrepRecipes(db)` (or reuse the same `listRecipes` result and filter client-side on `is_prep` — check which the existing page's data shape supports before choosing; prefer filtering the already-loaded `listRecipes(db)` result client-side if that call already returns `is_prep` per Task 5 Step 5, to avoid a second query). Add a small toggle/chip labeled "Prep only" that filters the visible list to `is_prep` recipes.

- [ ] **Step 9: Full verification + commit**

Run: `npm run check && npm run test:unit -- --run`
Expected: 0 errors, all green.

```bash
git add migrations/0008_recipe_prep.sql src/lib/server/migrations.ts src/lib/recipe.ts src/lib/server/recipes.ts src/lib/server/recipes.test.ts src/routes/\(recipes\)/RecipeEditor.svelte src/routes/\(recipes\)/recipes/+page.server.ts src/routes/\(recipes\)/recipes/+page.svelte
git commit -m "Add is_prep flag on recipes (migration 0008) + editor checkbox + list filter"
```

---

### Task 6: Render tokens in the recipe view

**Files:**
- Modify: `src/routes/(recipes)/RecipeBody.svelte`

**Interfaces:**
- Consumes: `tokenizeStepBody`, `StepSegment` from `$lib/recipe-parse` (Task 1).

- [ ] **Step 1: Read the current step-rendering block**

In `src/routes/(recipes)/RecipeBody.svelte`, the current step body render is:

```svelte
<li class="step">
	<p class="body">{s.body}</p>
	{#if s.ingredients.length}
		<p class="stepings">
			{#each s.ingredients as ing (ing.id)}<span class="pill">{amount(ing)} {ing.name}</span>{/each}
		</p>
	{/each}
	{#each s.children as c, k (k)}{@render child(c, `s${i}.${k}`)}{/each}
</li>
```

- [ ] **Step 2: Add the import and a tiny display helper**

Add to the `<script>` block:

```ts
import { tokenizeStepBody } from '$lib/recipe-parse';

function timerLabel(t: { label: string; quantity: string; unit: string }): string {
	const amt = [t.quantity, t.unit].filter(Boolean).join(' ');
	return t.label ? `${t.label}: ${amt}` : amt;
}
```

- [ ] **Step 3: Replace the flat body paragraph with a token-aware render**

Replace:

```svelte
<p class="body">{s.body}</p>
```

with:

```svelte
<p class="body">
	{#each tokenizeStepBody(s.body) as seg}
		{#if seg.type === 'text'}{seg.text}
		{:else if seg.type === 'ingredient'}<span class="tok-ing">{seg.name}</span>
		{:else if seg.type === 'timer'}<span class="tok-timer">⏱ {timerLabel(seg)}</span>
		{:else}<span class="tok-cmt">{seg.text}</span>
		{/if}
	{/each}
</p>
```

Keep the existing `.stepings` pill row below it exactly as is — it still shows the full amount for each linked ingredient (the inline chip above is a bare name; the pill row remains the "amounts at a glance" summary). Do not remove it.

- [ ] **Step 4: Style the new inline spans**

Add to the `<style>` block:

```css
.tok-ing { background: var(--accent-weak); border-radius: 0.3rem; padding: 0 0.25rem; }
.tok-timer { background: var(--surface-2); border-radius: 0.3rem; padding: 0 0.3rem; font-size: 0.85em; white-space: nowrap; }
.tok-cmt { color: var(--text-3); font-size: 0.9em; }
```

Add to the existing `@media print` block:

```css
.tok-ing, .tok-timer { background: none; }
```

- [ ] **Step 5: Verify + commit**

Run: `npm run check`
Expected: 0 errors, 0 warnings. This task has no new unit-testable logic (pure template change) — verify visually on `listapp-dev` after Task 11 (once AI import actually produces token-bearing recipes to look at); note that in the ledger rather than blocking this task on it.

```bash
git add src/routes/\(recipes\)/RecipeBody.svelte
git commit -m "RecipeBody: render @ingredient/~timer/--comment tokens inline"
```

---

### Task 7: `StepEditor.svelte` — contenteditable shell (chips, no toolbar yet)

**Files:**
- Create: `src/routes/(recipes)/StepEditor.svelte`
- Test: manual (component-level DOM behavior; no unit test framework here exercises contenteditable — verified via `npm run check` for types and manually on `listapp-dev`, per this plan's Global Constraints on Playwright).

**Interfaces:**
- Consumes: `tokenizeStepBody`, `StepSegment` from `$lib/recipe-parse` (Task 1).
- Produces:
  ```ts
  let { body = $bindable(), placeholder = '' }: { body: string; placeholder?: string } = $props();
  ```
  A `contenteditable` block whose displayed content is the chip-rendered form of `body`, and whose edits serialize back into `body` (plain token text) on every input.

- [ ] **Step 1: Build the segment → HTML round-trip helpers**

Create `src/routes/(recipes)/StepEditor.svelte`:

```svelte
<script lang="ts">
	import { tokenizeStepBody, type StepSegment } from '$lib/recipe-parse';

	let { body = $bindable(''), placeholder = 'Write this step…' }: { body: string; placeholder?: string } = $props();

	let el = $state<HTMLDivElement>();
	let composing = false; // true while the user is actively typing in this block

	function segToToken(seg: StepSegment): string {
		if (seg.type === 'ingredient') {
			const inner =
				(seg.quantity || seg.unit ? `${seg.quantity}%${seg.unit}` : '') +
				(seg.quantity2 || seg.unit2 ? `|${seg.quantity2}%${seg.unit2}` : '');
			return `@${seg.name}{${inner}}`;
		}
		if (seg.type === 'timer') return `~${seg.label}{${seg.quantity}%${seg.unit}}`;
		return '';
	}

	/** body (plain text w/ tokens) -> chip-rendered innerHTML */
	function render(text: string): string {
		return tokenizeStepBody(text)
			.map((seg) => {
				if (seg.type === 'text') return escapeHtml(seg.text);
				if (seg.type === 'comment') return `<span class="chip chip-cmt" contenteditable="false" data-token="${escapeAttr('-- ' + seg.text)}">${escapeHtml(seg.text)}</span>`;
				const token = segToToken(seg);
				const label = seg.type === 'ingredient' ? seg.name : `⏱ ${seg.label || ''} ${seg.quantity}${seg.unit}`.trim();
				const cls = seg.type === 'ingredient' ? 'chip chip-ing' : 'chip chip-timer';
				return `<span class="${cls}" contenteditable="false" data-token="${escapeAttr(token)}">${escapeHtml(label)}</span>`;
			})
			.join('');
	}

	/** current DOM content -> plain text w/ tokens (reads data-token off each chip span) */
	function serialize(node: Node): string {
		let out = '';
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? '';
			else if (child instanceof HTMLElement && child.dataset.token !== undefined) out += child.dataset.token;
			else if (child instanceof HTMLElement) out += serialize(child);
		}
		return out;
	}

	function escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
	function escapeAttr(s: string): string {
		return escapeHtml(s).replace(/"/g, '&quot;');
	}

	function onInput() {
		if (!el) return;
		composing = true;
		body = serialize(el);
		composing = false;
	}

	// keep the DOM in sync when `body` changes from outside this component
	// (e.g. a toolbar action elsewhere, or the initial load) — but never while
	// the user is mid-edit here, or the caret would jump.
	$effect(() => {
		if (!el || composing) return;
		const wanted = render(body);
		if (el.innerHTML !== wanted) el.innerHTML = wanted;
	});
</script>

<div
	bind:this={el}
	class="step-editable"
	contenteditable="true"
	data-placeholder={placeholder}
	oninput={onInput}
></div>

<style>
	.step-editable {
		min-height: 2.4rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface-1);
		font-size: 0.92rem;
		line-height: 1.5;
		outline: none;
	}
	.step-editable:focus { border-color: var(--accent); }
	.step-editable:empty::before {
		content: attr(data-placeholder);
		color: var(--text-3);
	}
	:global(.chip) {
		display: inline-block;
		border-radius: 0.3rem;
		padding: 0 0.3rem;
		margin: 0 0.05rem;
		user-select: none;
	}
	:global(.chip-ing) { background: var(--accent-weak); }
	:global(.chip-timer) { background: var(--surface-2); font-size: 0.9em; white-space: nowrap; }
	:global(.chip-cmt) { background: none; color: var(--text-3); font-size: 0.9em; }
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors, 0 warnings. `StepSegment` must be exported from `$lib/recipe-parse` (it is, from Task 1) for this import to resolve.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(recipes\)/StepEditor.svelte
git commit -m "Add StepEditor: contenteditable shell rendering step tokens as chips"
```

*(This component is not wired into `RecipeEditor.svelte` yet — that's Task 9. It is intentionally left disconnected so Task 7 and Task 8 each get their own reviewable diff.)*

---

### Task 8: Selection toolbar in `StepEditor.svelte`

**Files:**
- Modify: `src/routes/(recipes)/StepEditor.svelte`

**Interfaces:**
- Consumes: the Selection/Range DOM APIs; `catalog: string[]` prop (ingredient-name autocomplete, same list already threaded through `RecipeEditor.svelte` today).
- Produces: selecting text inside the editable block shows a small floating toolbar (Ingredient / Timer / Note / Sub-recipe); clicking Ingredient or Timer wraps the selection as the corresponding chip; Note appends a trailing comment chip; Sub-recipe is out of scope here (Task 9 wires the existing `+`-autocomplete pattern into `RecipeEditor.svelte` directly, not into this component — see Task 9's note).

- [ ] **Step 1: Add toolbar state + selection tracking**

Add to the `<script>` block of `src/routes/(recipes)/StepEditor.svelte` (after the existing state):

```ts
let { catalog = [] as string[] } = $props();

let toolbar = $state<{ x: number; y: number; text: string; range: Range } | null>(null);

function onSelectionChange() {
	const sel = window.getSelection();
	if (!sel || sel.isCollapsed || !el || !sel.anchorNode || !el.contains(sel.anchorNode)) {
		toolbar = null;
		return;
	}
	const range = sel.getRangeAt(0).cloneRange();
	const text = range.toString().trim();
	if (!text) {
		toolbar = null;
		return;
	}
	const rect = range.getBoundingClientRect();
	toolbar = { x: rect.left + rect.width / 2, y: rect.top, text, range };
}
```

Add `document.addEventListener('selectionchange', onSelectionChange)` / remove it on destroy:

```ts
$effect(() => {
	document.addEventListener('selectionchange', onSelectionChange);
	return () => document.removeEventListener('selectionchange', onSelectionChange);
});
```

- [ ] **Step 2: Wrap-selection helper**

```ts
function wrapSelectionWithChip(token: string, label: string, cls: string) {
	if (!toolbar || !el) return;
	const chip = document.createElement('span');
	chip.className = `chip ${cls}`;
	chip.contentEditable = 'false';
	chip.dataset.token = token;
	chip.textContent = label;
	toolbar.range.deleteContents();
	toolbar.range.insertNode(chip);
	toolbar = null;
	onInput();
}

const DURATION_RE = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i;

function markTimer() {
	if (!toolbar) return;
	const m = toolbar.text.match(DURATION_RE);
	const qty = m ? m[1] : '';
	const unit = m ? m[2].toLowerCase() : '';
	wrapSelectionWithChip(`~{${qty}%${unit}}`, `⏱ ${qty}${unit ? ' ' + unit : ''}`.trim() || '⏱ timer', 'chip-timer');
}

function markIngredient() {
	if (!toolbar) return;
	// quantity/unit default empty — the user (or AI) rarely hand-annotates a
	// quantity via selection; this exists for quick "link this word" cases.
	// Fine-grained qty/unit entry happens through AI import in practice.
	wrapSelectionWithChip(`@${toolbar.text}{}`, toolbar.text, 'chip-ing');
}

function markNote() {
	if (!el) return;
	const text = toolbar?.text ?? '';
	if (toolbar) toolbar.range.deleteContents();
	el.appendChild(document.createTextNode(' '));
	const chip = document.createElement('span');
	chip.className = 'chip chip-cmt';
	chip.contentEditable = 'false';
	chip.dataset.token = `-- ${text}`;
	chip.textContent = text || 'note';
	el.appendChild(chip);
	toolbar = null;
	onInput();
}
```

- [ ] **Step 3: Render the toolbar**

Add to the template, right after the `<div bind:this={el} ...></div>`:

```svelte
{#if toolbar}
	<div class="seltoolbar" style="left:{toolbar.x}px; top:{toolbar.y - 8}px" role="toolbar">
		<button type="button" onmousedown={(e) => { e.preventDefault(); markIngredient(); }}>Ingredient</button>
		<button type="button" onmousedown={(e) => { e.preventDefault(); markTimer(); }}>Timer</button>
		<button type="button" onmousedown={(e) => { e.preventDefault(); markNote(); }}>Note</button>
	</div>
{/if}
```

(`onmousedown` + `preventDefault` rather than `onclick`, so the toolbar acts before the browser's own selection-clearing `mouseup`/`blur` fires.)

- [ ] **Step 4: Style the toolbar**

Add to `<style>`:

```css
.seltoolbar {
	position: fixed;
	transform: translate(-50%, -100%);
	display: flex;
	gap: 0.2rem;
	background: var(--surface-1);
	border: 1px solid var(--line);
	border-radius: 0.5rem;
	padding: 0.25rem;
	box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
	z-index: 30;
}
.seltoolbar button {
	font-size: 0.78rem;
	padding: 0.3rem 0.55rem;
	border: 0;
	border-radius: 0.35rem;
	background: var(--surface-2);
	color: inherit;
}
.seltoolbar button:hover { background: var(--line); }
```

- [ ] **Step 5: Type-check + commit**

Run: `npm run check`
Expected: 0 errors, 0 warnings.

```bash
git add src/routes/\(recipes\)/StepEditor.svelte
git commit -m "StepEditor: add selection toolbar (Ingredient / Timer / Note)"
```

---

### Task 9: Wire `StepEditor` into `RecipeEditor.svelte`

**Files:**
- Modify: `src/routes/(recipes)/RecipeEditor.svelte`

**Interfaces:**
- Consumes: `StepEditor.svelte` (Task 7+8), `linkStepIngredients` (Task 2), the existing `parseMethod`/`serializeMethod` (kept, for the group-header/sub-recipe skeleton around each step).

**Design note carried from the spec:** the method textarea becomes a list of per-step `StepEditor` blocks (one per paragraph), not one giant contenteditable region — this keeps serialization tractable (no cross-paragraph contenteditable edge cases) and matches the existing "one step per paragraph" model. The "other ingredients" textarea (today's ingredients box) is kept, but its heading/hint text changes to reflect its new secondary role.

- [ ] **Step 1: Introduce per-step state**

In `src/routes/(recipes)/RecipeEditor.svelte`, replace the single `methodText` string with an array of step objects, keeping the ingredients textarea as-is:

Change:

```ts
let ingredientsText = $state(serializeIngredients(seed.ingredients, seed.miseEnPlaceIncludes));
let methodText = $state(
	serializeMethod(seed.steps.map((s) => ({ body: s.body, group: s.group, includes: s.includes })))
);
```

to:

```ts
import StepEditor from './StepEditor.svelte';
import { linkStepIngredients } from '$lib/recipe-parse';

let ingredientsText = $state(serializeIngredients(seed.ingredients, seed.miseEnPlaceIncludes));

type EditableStep = { body: string; group: string; includes: string[] };
let steps = $state<EditableStep[]>(
	seed.steps.length
		? seed.steps.map((s) => ({ body: s.body, group: s.group, includes: s.includes }))
		: [{ body: '', group: '', includes: [] }]
);
```

- [ ] **Step 2: Replace `parsedMethod`/`payload` derivation**

Change:

```ts
const parsedIng = $derived(parseIngredientsBlock(ingredientsText));
const parsedMethod = $derived(parseMethod(methodText));

const payload = $derived(
	JSON.stringify({
		title,
		servings,
		notes,
		source_url: sourceUrl,
		ingredients: parsedIng.ingredients,
		miseEnPlaceIncludes: [...parsedIng.includes, ...parsedMethod.leadingIncludes],
		steps: parsedMethod.steps
	} satisfies RecipeInput)
);
```

to:

```ts
const parsedIng = $derived(parseIngredientsBlock(ingredientsText));
const linked = $derived(linkStepIngredients(parsedIng.ingredients, steps));

const payload = $derived(
	JSON.stringify({
		title,
		servings,
		notes,
		source_url: sourceUrl,
		is_prep: isPrep,
		ingredients: linked.ingredients,
		miseEnPlaceIncludes: parsedIng.includes,
		steps: linked.steps
	} satisfies RecipeInput)
);
```

(`isPrep` is from Task 5 Step 7 — this task assumes Task 5 already landed, since both touch `RecipeEditor.svelte`; if executed out of order, add `is_prep: isPrep` only once Task 5's `let isPrep` exists.)

- [ ] **Step 3: Replace the Method card's textarea with per-step `StepEditor` blocks**

Replace the entire `<section class="card">...Method...</section>` block with:

```svelte
<section class="card">
	<h3>Method</h3>
	<p class="hint">
		Write each step, then select a word or phrase to mark it as an ingredient, a
		timer, or a note. Ingredients get linked automatically — no need to also list
		them below unless a step doesn't mention one by name.
	</p>
	{#each steps as step, i (i)}
		<div class="stepwrap">
			{#if step.group}<span class="grp">{step.group}</span>{/if}
			<StepEditor bind:body={step.body} catalog={parsedIng.ingredients.map((x) => x.name)} placeholder={`Step ${i + 1}…`} />
			<div class="steprow-actions">
				<button type="button" class="mk-btn" onclick={() => (steps = steps.filter((_, k) => k !== i))} disabled={steps.length === 1}>Remove step</button>
			</div>
		</div>
	{/each}
	<div class="mkbar">
		<button type="button" class="mk-btn" onclick={() => (steps = [...steps, { body: '', group: '', includes: [] }])}>＋ Step</button>
	</div>
</section>
```

Add to `<style>`:

```css
.stepwrap { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.6rem; }
.steprow-actions { display: flex; justify-content: flex-end; }
```

- [ ] **Step 4: Rename the ingredients card to reflect its secondary role**

In the Ingredients `<section class="card">`, change the `<h3>`/hint text:

```svelte
<h3>Other ingredients</h3>
<p class="hint">Anything not named in a step (e.g. "cooking spray"). Most ingredients belong in the steps above instead — select the word there and mark it as an ingredient.</p>
```

- [ ] **Step 5: Drop the now-unused sub-recipe/group-header machinery for the method textarea**

`onTextareaInput`/`onSubKeydown`/`insertLine`/`newStep`/`methodEl`/`subTarget` etc. were shared between the ingredients textarea and the method textarea. Since the method textarea is gone, **keep every one of these functions and variables exactly as they are** (they're still used by the ingredients textarea's "＋ Sub-recipe" button) — just remove the `which === 'method'` branches' now-dead call sites (the buttons that called `insertLine('method', ...)`/`newStep()` are gone along with the textarea). Do not delete the shared functions themselves; verify with `npm run check` that nothing references a removed `methodEl`/`methodText` binding.

- [ ] **Step 6: Verify + commit**

Run: `npm run check`
Expected: 0 errors, 0 warnings — this is the step most likely to surface a stray reference to the old `methodText`/`methodEl`/`parsedMethod` names; fix any that turn up (grep the file for `methodText`, `methodEl`, `parsedMethod` and remove/replace each).

Run: `npm run test:unit -- --run`
Expected: all green — no unit tests exercise this component directly, but this confirms nothing else broke.

```bash
git add src/routes/\(recipes\)/RecipeEditor.svelte
git commit -m "RecipeEditor: replace method textarea with per-step annotate editors"
```

---

### Task 10: Rewrite AI prompts to emit the token grammar

**Files:**
- Modify: `src/lib/server/recipe-import.ts`
- Test: `src/lib/server/recipe-import.test.ts`

**Interfaces:**
- No signature changes — `GEMINI_PROMPT`, `REFINE_PROMPT`, `TIDY_PROMPT`, `TIDY_INSTRUCTION_PROMPT`, `GENERATE_PROMPT` are string constants/functions; only their content changes.

- [ ] **Step 1: Rewrite `GEMINI_PROMPT`**

Replace the existing `GEMINI_PROMPT` constant in `src/lib/server/recipe-import.ts` with:

```ts
const GEMINI_PROMPT = `You are given a recipe (as text or a photo of a page). Reply with ONLY the recipe in this exact plain-text format, nothing else:

Title: <name>
Serves: <yield, optional>

@ingredients
1 tsp fine salt

@method
Fry @pancetta{200%g} until crispy, then add @garlic{2%cloves} for ~{30%seconds}.

Fold in the @flour{1.5%cups|190%g} and salt. -- if the dough looks dry, add a splash of water

Bake at 350F for 25 minutes.

Rules:
- Every ingredient used in a step is written INLINE in the step, as \`@name{qty%unit}\` right where it's used — e.g. "Fry @pancetta{200%g} until crispy." Do NOT also repeat it under @ingredients.
- Only put an ingredient under @ingredients if it genuinely isn't named in any step (rare — e.g. "cooking spray").
- A multi-word ingredient name still goes inside the braces: \`@ground beef{1%lb}\`, not \`@ground @beef\`.
- If the source gives an ingredient two ways (weight AND volume), use both inside one token separated by "|": \`@flour{1.5%cups|190%g}\`.
- Mark a meaningful wait/cook time as a timer: \`~{30%seconds}\` (anonymous) or \`~simmer{45%minutes}\` (named) — right where it occurs in the sentence.
- Keep each step SHORT and DIRECT — one clear instruction. If there's extra detail (a tip, a substitution, "why"), put it in a trailing comment at the END of the step only: "Simmer until tender. -- canned beans work fine too." Never put that extra detail in the middle of the instruction sentence.
- "## " lines are section headers (e.g. "For the sauce"); use them in both blocks when the recipe has parts.
- Standard unit abbreviations: tsp, tbsp, cup, g, kg, oz, lb, ml, l.
- Do not invent quantities, ingredients, or steps not in the source.`;
```

- [ ] **Step 2: Rewrite `REFINE_PROMPT`**

Replace:

```ts
const REFINE_PROMPT = `A recipe has already been roughly parsed. Below is that parse, then the original source. Return a CORRECTED version in the same format — fix only what the parse got wrong:
- merge duplicated ingredients; split any that were run together onto one line
- move prep words ("minced", "sifted", "at room temperature") out of the name, into parentheses
- an ingredient shown the same way twice ("500 g | 17.6 oz", "300 ml | 10 fl oz") should keep ONLY the metric measure; keep genuine "cups | grams" (volume + weight) pairs
- correct a wrong or missing Title / Serves
- make sure every ingredient named in the method also appears under @ingredients
- keep the method wording; only fix its structure (one step per paragraph)
Do not add anything the source does not support.`;
```

with:

```ts
const REFINE_PROMPT = `A recipe has already been roughly parsed. Below is that parse, then the original source. Return a CORRECTED version in the same format — fix only what the parse got wrong:
- if an ingredient appears under @ingredients AND is also used in a step, move it: delete the @ingredients line and instead write it inline in that step as \`@name{qty%unit}\`, right where the step uses it. Only leave an ingredient under @ingredients if no step names it.
- merge duplicated ingredients; split any that were run together
- move prep words ("minced", "sifted", "at room temperature") out of the name, into parentheses in the ingredient's own line/token
- an ingredient shown the same way twice ("500 g | 17.6 oz") should keep ONLY the metric measure inside its \`@name{qty%unit}\` token; keep a genuine "cups | grams" pair as \`@name{1.5%cups|190%g}\`
- correct a wrong or missing Title / Serves
- keep each step short and direct; if the source has extra detail beyond the core instruction, move it to a trailing \`-- comment\` at the END of that step, not mid-sentence
- mark a meaningful wait/cook time as \`~{qty%unit}\` or \`~label{qty%unit}\` right where it occurs
Do not add anything the source does not support.`;
```

- [ ] **Step 3: Rewrite `TIDY_PROMPT` and `TIDY_INSTRUCTION_PROMPT`**

Replace:

```ts
const TIDY_PROMPT = `Tidy this recipe. Return the same format. Only:
- normalise units and quantities; if an ingredient lists the same measure twice ("500 g | 17.6 oz") keep only the metric one
- move prep words out of ingredient names into parentheses
- fix obvious typos and tighten step wording WITHOUT changing meaning or quantities
- ensure every ingredient the steps mention is under @ingredients
Keep all real content — do not drop or invent ingredients or steps.`;
```

with:

```ts
const TIDY_PROMPT = `Tidy this recipe. Return the same format. Only:
- normalise units and quantities; if an ingredient lists the same measure twice ("500 g | 17.6 oz") keep only the metric one inside its @{} token
- move prep words out of ingredient names into parentheses on the ingredient's own line/token
- fix obvious typos and tighten step wording WITHOUT changing meaning or quantities
- if an ingredient is listed under @ingredients but also used in a step, move it inline into that step as \`@name{qty%unit}\` and remove the @ingredients line
- keep each step short and direct; move any extra detail to a trailing \`-- comment\` at the end of that step
Keep all real content — do not drop or invent ingredients or steps.`;
```

Leave `TIDY_INSTRUCTION_PROMPT`'s function body untouched except append one line to its "Notes:" list:

```ts
- Keep every ingredient reference inline as \`@name{qty%unit}\` in the step that uses it, and any timer as \`~{qty%unit}\`.
```

- [ ] **Step 4: Rewrite `GENERATE_PROMPT`**

Apply the same inline-token instructions used in `GEMINI_PROMPT` Step 1 to `GENERATE_PROMPT`'s rule list and example block (mirror the exact wording — both prompts must stay consistent, since they're read by the same downstream parser).

- [ ] **Step 5: Update test fixtures**

Read `src/lib/server/recipe-import.test.ts` in full first. Any fixture string that represents a mocked Gemini response in the old `@ingredients`-only format should get at least one test updated to use an inline-token response instead, asserting the resulting `RecipeInput` has the ingredient correctly linked to its step (via `draft.steps[0].ingredientIds`) — this exercises the Task 3 wiring (`parsePlainRecipe` → `linkStepIngredients`) through the AI-response-parsing path specifically. Do not remove existing JSON-LD/microdata tests — they're unaffected by this task.

- [ ] **Step 6: Verify + commit**

Run: `npm run test:unit -- --run && npm run check`
Expected: all green, 0 errors.

```bash
git add src/lib/server/recipe-import.ts src/lib/server/recipe-import.test.ts
git commit -m "Rewrite AI import prompts to emit inline @ingredient/~timer/--comment tokens"
```

---

### Task 11: Prep / cook-day screen

**Files:**
- Create: `src/routes/(recipes)/prep/+page.server.ts`, `src/routes/(recipes)/prep/+page.svelte`
- Modify: `src/routes/(recipes)/recipes/+page.svelte` (link to the new screen), `vite.config.ts` (service-worker denylist)

**Interfaces:**
- Consumes: `listPrepRecipes` (Task 5), `collectListIngredients`, `addItemsToList` (both already exported by `src/lib/server/recipes.ts`, unchanged).

- [ ] **Step 1: `load` + the two actions**

Create `src/routes/(recipes)/prep/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { instance } from '$lib/server/instance';
import { addItemsToList, collectListIngredients, listPrepRecipes } from '$lib/server/recipes';
import { changesSince } from '$lib/server/sync';
import { publish } from '$lib/server/events';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { db } = await instance();
	return { recipes: listPrepRecipes(db) };
};

export const actions: Actions = {
	ingredients: async ({ request }) => {
		const { db } = await instance();
		const ids = (await request.formData()).getAll('recipeId').map(String);
		if (!ids.length) return fail(400, { error: 'Pick at least one recipe.' });
		const seen = new Set<string>();
		const items: { name: string; item_id: string | null }[] = [];
		for (const id of ids) {
			for (const it of collectListIngredients(db, id)) {
				const key = it.name.toLowerCase();
				if (seen.has(key)) continue;
				seen.add(key);
				items.push(it);
			}
		}
		return { ids, items };
	},
	addToList: async ({ request }) => {
		const { db } = await instance();
		const names = (await request.formData()).getAll('name').map(String);
		if (!names.length) redirect(303, '/prep');
		const items = names.map((name) => ({ name, item_id: null }));
		addItemsToList(db, items);
		publish(changesSince(db, 0).cursor);
		redirect(303, '/recipes');
	}
};
```

(`changesSince` is exported from `$lib/server/sync`, `publish` from `$lib/server/events` — confirmed against `src/routes/(recipes)/recipes/[id]/+page.server.ts`'s existing `addToList` action, which uses the exact same `publish(changesSince(db, 0).cursor)` pattern.)

- [ ] **Step 2: The picker + confirm UI**

Create `src/routes/(recipes)/prep/+page.svelte`:

```svelte
<script lang="ts">
	import Screen from '$lib/nav/Screen.svelte';
	let { data, form } = $props();
	let picked = $state<Record<string, string>>({}); // name -> 'on' | undefined
</script>

<svelte:head><title>Prep day</title></svelte:head>

<Screen title="Prep day" back="/recipes">
	{#if form?.items}
		<p class="ok">Confirm what you need — untick anything you already have.</p>
		<form method="POST" action="?/addToList" class="list">
			{#each form.items as it (it.name)}
				<label class="row">
					<input type="checkbox" name="name" value={it.name} checked />
					<span>{it.name}</span>
					{#if it.item_id}<span class="badge">in your items</span>{/if}
				</label>
			{/each}
			<button class="btn btn-sm btn-primary">Add missing to the list</button>
		</form>
	{:else}
		{#if form?.error}<p class="err">{form.error}</p>{/if}
		<p class="hint">Pick the recipes you're batch-cooking this weekend.</p>
		<form method="POST" action="?/ingredients" class="list">
			{#each data.recipes as r (r.id)}
				<label class="row">
					<input type="checkbox" name="recipeId" value={r.id} />
					<span>{r.title}</span>
				</label>
			{/each}
			{#if !data.recipes.length}
				<p class="hint">No recipes are marked as prep recipes yet — open a recipe's editor and check "Weekend batch-prep recipe".</p>
			{/if}
			<button class="btn btn-sm btn-primary" disabled={!data.recipes.length}>Check ingredients</button>
		</form>
	{/if}
</Screen>

<style>
	.list { display: flex; flex-direction: column; gap: 0.5rem; margin: 0.6rem 0; }
	.row { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0; border-bottom: 1px solid var(--line); }
	.badge { margin-left: auto; font-size: 0.75rem; color: var(--text-2); background: var(--surface-2); border-radius: 999px; padding: 0.1rem 0.5rem; }
	.hint { color: var(--text-2); font-size: 0.88rem; }
	.ok { color: var(--text-2); font-size: 0.9rem; }
	.err { color: var(--danger); font-size: 0.85rem; }
</style>
```

- [ ] **Step 3: Link from `/recipes`**

In `src/routes/(recipes)/recipes/+page.svelte`, add a link/button near the existing "New"/"Import" actions: `<a class="btn btn-sm" href="/prep">Prep day</a>` (match the exact surrounding markup/classes already used by the New/Import links — read the file first).

- [ ] **Step 4: Service-worker denylist**

In `vite.config.ts`, `/recipes` is already denylisted via the `/^\/recipes/` pattern — confirm `/prep` needs its own entry (it's a sibling top-level route, not under `/recipes/*`, so the existing regex does **not** cover it). Add `/^\/prep/` to `workbox.navigateFallbackDenylist`.

- [ ] **Step 5: Verify + commit**

Run: `npm run check`
Expected: 0 errors, 0 warnings.

```bash
git add src/routes/\(recipes\)/prep src/routes/\(recipes\)/recipes/+page.svelte vite.config.ts
git commit -m "Add prep/cook-day screen: pick prep recipes, confirm ingredients, add to list"
```

---

### Task 12: Existing-recipe cleanup script

**Files:**
- Create: `scripts/reparse-recipes-to-tokens.ts`

**Interfaces:**
- Consumes: `listRecipes`, `getRecipe`, `fullRecipeToInput`, `saveRecipe` (`src/lib/server/recipes.ts`), `tidyRecipe` (`src/lib/server/recipe-import.ts`), `openDb` (`src/lib/server/db.ts` — confirm exact export name by reading that file first).

This is an **operational script**, run once by hand against the real database after every other task has shipped and been verified — not part of the running app, and not executed automatically by this plan. It is the mechanism for the "go through the data and clean it up" step the user asked for.

- [ ] **Step 1: Write the script**

Create `scripts/reparse-recipes-to-tokens.ts`:

```ts
// One-time cleanup: re-run every existing recipe through the updated AI tidy
// pass so it picks up the new @ingredient/~timer/--comment token grammar.
// Usage: LIST_DB_PATH=./data/list.db npx tsx scripts/reparse-recipes-to-tokens.ts
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
			saveRecipe(db, row.id, tidied);
			console.log(`  ok: ${row.title}`);
		} catch (e) {
			console.error(`  FAILED: ${row.title} — ${e instanceof Error ? e.message : e}`);
		}
	}
	console.log('Done.');
}

main();
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors — confirm `openDb`'s actual exported name/signature from `src/lib/server/db.ts` and adjust the import if it differs from the guess above (e.g. it may take an options object rather than a bare path — match its real signature).

- [ ] **Step 3: Commit (do not run yet)**

```bash
git add scripts/reparse-recipes-to-tokens.ts
git commit -m "Add one-time script to reparse existing recipes into the new token format"
```

*(Running this script against the real `listapp` database is a deliberate, separate step taken after Task 11 ships and is verified on `listapp-dev` — not automatically part of this plan's execution. It needs `aiConfigured(db)` to be true, i.e. a Gemini key must already be set in Settings.)*

---

## Final verification (after every task above is complete)

1. `npm run check` — 0 errors, 0 warnings.
2. `npm run test:unit -- --run` — full suite green.
3. `npm run build` — clean build.
4. One headless run: `npx playwright test` (per the Global Constraints — once, here, not per task).
5. Rebuild and redeploy `listapp-dev` (`./run-list-dev.sh`) and hand off to the user to try: import a recipe photo, watch it come back with inline ingredient/timer chips in the review editor; open an existing recipe's editor and try the selection toolbar by hand; mark two recipes `is_prep` and walk `/prep` end to end.
6. Only after the user confirms `listapp-dev` looks right: deploy to the real `listapp` (`./run-list.sh`), then run the Task 12 script once against the production DB (`LIST_DB_PATH` pointed at `list/data/list.db`) to clean up the existing recipe library.
