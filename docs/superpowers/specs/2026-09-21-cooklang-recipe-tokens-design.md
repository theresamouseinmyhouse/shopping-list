# Cooklang-derivative recipe tokens + prep tagging — Design

## Problem

Recipe steps currently link to ingredients by **fuzzy name-matching**
(`matchIngredientsInProse`) after the fact — search the step's prose for
words that look like an ingredient name. This has been unreliable in
practice (the stated reason for this redesign). Separately, two real
workflow gaps surfaced while actually batch-cooking:

1. No way to mark which recipes are good **weekend batch-prep components**
   (vs. everyday dinners), or a screen to plan a batch-cook day from them.
2. No structured **timing/equipment** data on a step, so there's no way to
   build a cook-day timeline or (eventually) an in-app timer.

## Goals

- Replace fuzzy step↔ingredient matching with **exact, explicit links**,
  authored either by AI import (the primary real-world path — photos and
  URLs) or by hand via a lightweight annotate-in-place editor.
- Borrow Cooklang's actual inline-token idiom (`@ingredient{qty%unit}`,
  `~{duration}`, `-- trailing comment`) rather than inventing new syntax,
  since it's a well-designed fit for "prose is the source of truth," which
  is already this app's model.
- Keep the editing experience **simple** — the user does not want to have
  to learn/type a markup language. Authoring is either AI-driven (photo /
  URL import, the dominant real usage) or done by selecting text and
  clicking a toolbar button, TinyMCE-style (visually), with no new heavy
  dependency.
- Add a minimal **is_prep** flag on recipes (same pattern as
  `items.is_staple` — no general tag system) and a **prep/cook-day
  screen**: filter recipes by that flag, pick the ones for this weekend,
  confirm ingredients, push anything missing to the shopping list.
- After the new format ships, **re-run every existing recipe** through the
  updated AI tidy pass so the whole library picks up the new tokens — a
  one-time content cleanup, not a schema migration.

## Non-goals

- No general-purpose tag system (`is_prep` is a single boolean, matching
  `is_staple`'s precedent — see the design conversation for why this was
  explicitly rejected).
- No cookware/tool tokens (`#pan{}`) and no automatic cook-day scheduling
  algorithm (oven/tool conflict detection). The token grammar leaves room
  for a cookware token later, but it is not built now.
- No adoption of Cooklang's actual `.cook`/`.menu` file format, and no
  switch to Cook Editor / cook.md — those are separate products with their
  own file-based storage; `list` keeps its own DB-backed model and just
  borrows the token syntax.
- No full rich-text/WYSIWYG editor (bold/italic/etc.) — the new editor
  component only understands this app's specific tokens.

## Token grammar (borrowed from Cooklang, minimal extension)

All tokens live **inline inside step prose**, exactly like Cooklang. They
are the authoritative source — `recipe_ingredients` rows are *derived* from
them at save time, not typed separately.

| Token | Meaning | Example |
|---|---|---|
| `@name` | ingredient reference, no explicit quantity (rare — usually has one) | `season with @salt` |
| `@name{qty%unit}` | ingredient reference with quantity | `@pancetta{200%g}` |
| `@name{qty%unit\|qty2%unit2}` | dual measure (list-specific extension — Cooklang's own grammar is single-valued) | `@flour{1.5%cups\|190%g}` |
| `~{duration}` | anonymous timer | `~{30%seconds}` |
| `~label{duration}` | named timer | `~simmer{45%minutes}` |
| `-- comment` | trailing, de-emphasized note — **end of step only** | `Simmer until tender. -- canned beans work too` |

Unchanged, still parsed exactly as today (no collision — these occupy a
different lexical position, line-start vs. inline-mid-sentence):

- `## Group heading` — line-start, section header for a run of steps or
  ingredients.
- `+ Recipe Title` — a sub-recipe include.

A quantity's `unit` is free text, run through the existing
`canonicalizeUnit`. `name` matches an existing canonical ingredient by
`normalizeName` (today's matching helper) if one exists in this recipe
already; otherwise a new one is created — same effective behavior as today,
just triggered by an explicit token instead of a name guess.

## Data model — no schema migration for tokens

`recipe_steps.body` and `recipe_ingredients.*` keep their current columns
(see `migrations/0006_recipe_ingredients.sql`, `0007_recipe_parse.sql`).
This is purely a parsing/rendering change:

- **New parser function** `extractStepTokens(body): { ingredientRefs, timers, comment }`
  in `src/lib/recipe-parse.ts`, replacing `matchIngredientsInProse` as the
  *primary* path for step↔ingredient linking. It walks the body for
  `@name{...}` tokens, resolves each to a canonical `RecipeIngredient`
  (existing entry by `normalizeName`, or a newly-created one seeded from the
  token's quantity/unit), and returns the explicit `ingredientIds` for that
  step plus a list of `{ label, quantity, unit }` timers and the trailing
  comment text (everything after a step-final `-- `).
- `matchIngredientsInProse` **is kept**, not deleted — it remains the
  fallback for the two paths that can never carry tokens: JSON-LD/microdata
  URL import and pasted plain text (see "AI vs. non-AI paths" below). A
  step's ingredient links become: explicit token refs ∪ prose-guessed refs
  (today's existing `ingredientIds` field already models "explicit ∪
  matched," so this is additive, not a breaking change to `RecipeStep`).
- `RecipeIngredient`/`RecipeInput`/`RecipeStep` (in `src/lib/recipe.ts`)
  are **unchanged** — same shape, same `coerceRecipeInput`. Dual-measure
  fields (`quantity2`/`unit2`/`preferAlt`) already exist and already drive
  the existing "pick one" chooser (`hasDualMeasure`/`displayAmount` in
  `recipe.ts`, the chooser UI in `recipes/import/+page.svelte`) — the `|`
  token syntax feeds those same fields, so the chooser is unaffected.
- **Ingredients not named in any step** (e.g. "cooking spray," implied
  pantry items) still need somewhere to live. The existing ingredients
  block is **kept**, but demoted to an "other ingredients" list — anything
  the new editor's tokens don't cover. It stops being the primary authoring
  surface; most ingredients will now arrive via step tokens instead.

## `is_prep` flag — migration `0008_recipe_prep.sql`

```sql
ALTER TABLE recipes ADD COLUMN is_prep INTEGER NOT NULL DEFAULT 0;
```

Same boolean-flag pattern as `items.is_staple`. Exposed as a checkbox in
`RecipeEditor.svelte`, a filter chip on `/recipes`, and the basis for the
new prep screen's recipe picker.

## Editor — annotate-in-place surface

Replaces the current plain `<textarea>` for the **method** field in
`RecipeEditor.svelte` with a `contenteditable` surface (no new dependency —
built on the DOM Selection API, not CodeMirror/TinyMCE):

- Selecting a word or phrase shows a small floating toolbar: **Ingredient**,
  **Timer**, **Note**, **Sub-recipe**.
  - **Ingredient** wraps the selection as an `@name` token; a small inline
    popover asks for quantity/unit (pre-filled with the selected text as
    the name, editable), reusing the same catalog-name autocomplete used
    elsewhere.
  - **Timer** tries to parse a duration straight out of the selection
    ("30 seconds" → `~{30%seconds}` automatically); falls back to a short
    prompt if it can't.
  - **Note** appends `-- ` at the end of the current step and places the
    cursor there.
  - **Sub-recipe** reuses the existing `+Name` autocomplete
    (`RecipeEditor.svelte`'s `pickSub`/`subMatches` logic) unchanged.
- Each token renders as a distinct inline chip **while editing**, not only
  in a separate preview — matching the reference screenshot's look, without
  the strict Cooklang authoring requirement (you're never required to type
  `{}`/`%` yourself; the toolbar writes it).
- On save, the surface serializes back to the same plain-text token format
  described above (`recipe_steps.body` stays a single TEXT column — this is
  purely an authoring-experience layer on top of the existing string).
- The "other ingredients" block (see Data model) keeps today's plain
  textarea — it's a short, secondary list, not worth a rich editor.
- The `## Group heading` / `+ Sub-recipe` markup-helper buttons already in
  `RecipeEditor.svelte` keep working exactly as today.

## AI prompts (`src/lib/server/recipe-import.ts`)

`GEMINI_PROMPT`, `REFINE_PROMPT`, `TIDY_PROMPT`, `TIDY_INSTRUCTION_PROMPT`,
and `GENERATE_PROMPT` are rewritten to emit the token grammar directly
inside step prose, replacing the current custom `@ingredients`/`@method`
block format. This is the highest-value change since photo/URL-with-AI
import is the dominant real usage — an imported recipe arrives already
precisely linked, no fuzzy step afterward. The prompts also get the
already-agreed step-style rule baked in: short, direct instructions, with
anything extra as a trailing `-- ` comment (not folded into the main
sentence).

## AI vs. non-AI paths

- **AI paths** (photo, "…with AI", "Make one up", "Tidy with AI") — emit
  and consume the new token grammar natively. This is where the fuzzy-match
  problem actually gets fixed.
- **Non-AI paths** (JSON-LD/microdata structured data, pasted plain text)
  have no tokens to read from their source — they keep using today's
  `matchIngredientsInProse` heuristic exactly as now. Not a regression:
  these paths already don't carry precise step/ingredient linkage today
  either, and "…with AI" is one click away to upgrade a thin/wrong parse.

## View rendering (`RecipeBody.svelte`)

`s.body` currently renders as flat text
(`<p class="body">{s.body}</p>`). It's replaced with a small inline
renderer that walks the same token grammar and outputs:
- `@name{qty%unit}` → an inline chip (ingredient name, quantity on
  hover/tap) — visually similar to today's separate `.pill` row under each
  step, but inline within the sentence.
- `~{duration}` / `~label{duration}` → a small timer badge (foundation for
  a future in-app countdown — not built now, just rendered).
- Trailing `-- comment` → rendered in dim/muted text
  (`color: var(--text-3)`), separated from the main instruction.
- `@media print` renders tokens as plain inline text (no chip/badge
  styling), consistent with the existing print stylesheet's plain-paper
  intent.

## Prep / cook-day screen

New route (name TBD in planning — e.g. `/prep`), reachable from `/recipes`:

1. **Pick recipes** — a list filtered to `is_prep = 1`, multi-select.
2. **Confirm ingredients** — reuses the existing add-to-list chooser
   pattern (`collectListIngredients`/the recipe view's "Add to list"
   checklist) across the selected recipes: flattened, deduped ingredient
   list, "in your items" badge where the catalog already has it, untick
   anything you already have.
3. **Add missing to list** — same `addItemsToList`/`applyOps` path already
   used by the single-recipe "Add to list" button.

No timing/sequencing UI is built in this pass (see Non-goals) — the
`~{}` timer tokens captured during authoring are the groundwork for that,
not a deliverable now.

## Existing-recipe cleanup

Not a schema migration (none is needed for the token model). After this
ships, every existing recipe gets re-run through the updated AI tidy path
(same mechanism as the "Tidy with AI" button — `tidyRecipe()` in
`recipe-import.ts`, now targeting the new prompt) and re-saved through the
existing `saveRecipe` pipeline. Done once, directly, across the whole
library — not built as a new user-facing bulk-migration feature.

## Testing

- `src/lib/recipe-parse.test.ts` (existing file, extended): `extractStepTokens`
  — single/dual-measure ingredient tokens, named/anonymous timers, trailing
  comment only recognized at step end (not mid-sentence), round-trip
  through the annotate editor's serializer.
- `src/lib/server/recipe-import.test.ts` (existing): updated fixtures for
  the new prompt output format; JSON-LD/microdata paths unchanged
  (regression check that they still fall back to `matchIngredientsInProse`).
- `RecipeBody.svelte` gets a component test (or is covered by the existing
  recipe-view flow) verifying chip/timer/comment rendering from a body
  string containing all three token kinds.
- `src/lib/server/recipes.test.ts`: `is_prep` round-trips through
  save/get; prep-screen query filters correctly.
- Manual verification on `listapp-dev` (per the standing no-Playwright
  rule): import a photo, confirm the resulting step text shows tokens
  correctly in the new editor and renders correctly in the view; mark a
  couple of recipes `is_prep` and walk the new prep screen end-to-end.
