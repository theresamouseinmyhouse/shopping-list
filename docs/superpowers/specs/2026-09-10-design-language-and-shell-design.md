# Design language + app shell — design

**Status:** approved to plan · **Date:** 2026-09-10

## Problem

`list` grew a recipe keeper alongside the shopping list and the two feel like
separate apps bolted together: different headers, different button/input styles,
and no persistent navigation — you reach Items or Recipes from a link on the list
screen and then use the browser Back button to return. Store switching lives in a
scrolling pill row that adds header height, and store management is a
`window.prompt()`.

## Goals

1. One coherent visual language — a small, documented token system, dark-first,
   applied identically across the SPA (`(app)`) and SSR (`(recipes)`) route groups.
2. Persistent navigation: a bottom tab bar (**List · Stores · Items · Recipes**)
   present on every screen, so no screen is a dead end.
3. HIG-borrowed *structure* — bottom tabs, large titles that collapse into a slim
   sticky header, bottom sheets for secondary actions — rendered in a neutral
   modern-web style, not iOS or Material chrome.
4. Give stores a real home (`/stores`) and a focused per-store "walk the aisles"
   screen (`/stores/[id]`), replacing the pills and the `prompt()`.

## Non-goals

- No theme toggle — the app follows `prefers-color-scheme` as it does today.
- No web fonts — the system font stack stays.
- No new sync ops, no schema changes. Store CRUD already exists
  (`add_place` / `rename_place` / `move_place` / `delete_place`); `/stores` is
  just UI over it.
- "Sections / more criteria inside a store" is explicitly deferred — `/stores/[id]`
  is designed to have room for it later, but it is not built now.
- No change to the parser / import / sync engines.

## Design tokens

Authored **dark-first**: the dark palette is the base `:root`, and a
`@media (prefers-color-scheme: light)` block overrides the surface/text/line
ramp. Defined once in `src/routes/+layout.svelte` `:global(:root)` (where the
current tokens live).

### Color

| token | dark | role |
|---|---|---|
| `--bg` | `#0b0f16` | app ground (body) |
| `--surface-1` | `#141a24` | cards, sticky headers, tab bar, sheets |
| `--surface-2` | `#1c2430` | inputs, pressed/selected fills, steppers |
| `--surface-3` | `#26303d` | hover, sheet grab-handle |
| `--text` | `#e8ebf0` | primary text |
| `--text-2` | `#a3adbd` | secondary (notes, counts, captions) |
| `--text-3` | `#6b7688` | tertiary, disabled, inactive tab |
| `--line` | `#222c3a` | hairline dividers |
| `--line-strong` | `#3a4658` | input borders, unchecked check-circle |
| `--accent` | `#3b82f6` | primary action, active tab, links |
| `--accent-press` | `#2f6fd6` | pressed accent |
| `--accent-weak` | `rgb(59 130 246 / 0.14)` | selected row bg, tinted buttons |
| `--good` | `#34d399` | checked-off fill (replaces hard-coded `#16a34a`) |
| `--danger` | `#f87171` | destructive text/border |
| `--danger-weak` | `rgb(248 113 113 / 0.13)` | destructive button bg |

Light mode overrides `--bg`→`#ffffff`, the surface ramp
(`#f7f8fa`/`#eef1f5`/`#e6eaf0`), text (`#0f172a`/`#475569`/`#8592a6`), lines
(`#e4e8ee`/`#c2cad6`), `--accent`→`#2563eb`, and the `-weak`/`--good`/`--danger`
values as needed for contrast. `color-scheme: light dark` stays.

`--check-line` (added earlier) is removed — call sites use `--line-strong`.

### Radius / spacing / type / motion / elevation

```
--r-sm: 8px;  --r-md: 12px;  --r-lg: 16px;  --r-full: 999px;

/* spacing: a 4px grid — 4 8 12 16 20 24 32, used as rem in CSS, documented not tokenised */

--fs-title: 1.6rem;   --fw-title: 700;   /* large collapsing screen title */
--fs-head:  1.02rem;  --fw-head:  650;   /* section headers (Ingredients, Checked…) */
--fs-body:  0.95rem;
--fs-sub:   0.82rem;                     /* secondary lines */
--fs-cap:   0.72rem;                     /* counts, tab labels, group captions */
/* line-height 1.5 body, 1.2 titles */

--dur-fast: 120ms;  --dur: 200ms;  --dur-sheet: 320ms;
--ease: cubic-bezier(0.32, 0.72, 0, 1);   /* gentle spring-out, used for sheets & press */

--shadow-sheet: 0 -10px 40px rgb(0 0 0 / 0.45);   /* the ONLY shadow — sheets + tab bar top edge */
```

Everything else is a **hairline border, not a shadow**. Every interactive
element gets `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.

### Layout tokens

```
--tabbar-h: 3.25rem;
--header-h: 2.75rem;         /* slim sticky header */
--safe-b: env(safe-area-inset-bottom, 0px);
--safe-t: env(safe-area-inset-top, 0px);
--kb: 0px;                    /* keyboard height, already maintained in (app)/+layout */
```

## Global stylesheet

New `src/lib/styles/app.css`, imported once from `src/routes/+layout.svelte`.
Absorbs and replaces the `:global(.rec-*)` block in `(recipes)/+layout.svelte`,
the `.link` / `.chip` / `.danger` rules duplicated across `(app)` pages, and the
`.rec-btn` / `.rec-input` rules. Provides:

- **`.btn`** base (min 44px target, `--r-md`, `--fs-body`, `--ease` press
  transform) + `.btn-primary` (accent), `.btn-tinted` (`--accent-weak` bg,
  accent text), `.btn-plain` (text only), `.btn-danger`. `.btn-sm` modifier.
- **`.field`** for `input` / `textarea` / `select` — `--surface-2`,
  `1px --line-strong`, `--r-md`, consistent padding, focus ring.
- **`.group`** / **`.group-head`** / **`.row`** — the grouped-list idiom
  (hairline dividers, `--surface-1` card, caption-style header in `--text-3`).
- **`.caption`** — uppercase `--fs-cap` `--text-3`, used for section labels.
- Keeps the existing `:global(.drag-ghost)`, `[hidden]` handling.

Component-scoped `<style>` blocks stay for anything genuinely local; shared
idioms move here.

## App shell

### `src/lib/nav/BottomTabBar.svelte`

- Fixed to the bottom: `height: calc(var(--tabbar-h) + var(--safe-b));
  padding-bottom: var(--safe-b)`. `background: color-mix(in srgb, var(--surface-1) 88%, transparent)`
  + `backdrop-filter: blur(14px)`; `border-top: 1px solid var(--line)`.
- Four `<a>` tabs, each an icon (lucide, 22px) above a `--fs-cap` label:

  | tab | href | lucide icon | active when |
  |---|---|---|---|
  | List | `/` | `list` | `pathname === '/'` |
  | Stores | `/stores` | `store` | `pathname.startsWith('/stores')` |
  | Items | `/catalog` | `package` | `pathname === '/catalog'` |
  | Recipes | `/recipes` | `book-open` | `pathname.startsWith('/recipes')` |

- Active tab: `--accent` icon + label + `font-weight: 650`. Inactive: `--text-3`.
- `pathname` from `import { page } from '$app/state'` — works in SSR and CSR.

### `src/routes/+layout.svelte`

```svelte
<script>
  import '$lib/styles/app.css';
  import { page } from '$app/state';
  import BottomTabBar from '$lib/nav/BottomTabBar.svelte';
  let { children } = $props();
  // no tab bar on login or the modal-style recipe sub-flows (create/edit/import)
  const p = $derived(page.url.pathname);
  const chromeless = $derived(
    p === '/login' ||
    p === '/recipes/new' ||
    p === '/recipes/import' ||
    /^\/recipes\/[^/]+\/edit$/.test(p)
  );
</script>

{@render children?.()}
{#if !chromeless}<BottomTabBar />{/if}
```

The recipe create/edit/import screens are hierarchical sub-flows presented
full-screen with a `<Screen back>` header (the `back` link is the Cancel
affordance) — no tabs, so `RecipeEditor`'s sticky `.actions` bar stays at
`bottom: 0` with nothing to clear.

Bottom clearance for content is added in each group layout (not the root, so
`/login` is exempt):

- `(app)/+layout.svelte`: wrap children in a `.screen-scroll` with
  `padding-bottom: calc(var(--tabbar-h) + var(--safe-b) + 0.5rem)`.
- `(recipes)/+layout.svelte`: `.wrap` bottom padding becomes the same
  expression (drops the magic `4rem`); `@media print` still zeroes it.

`theme-color` meta moves to the root `<svelte:head>` and becomes the dark
`--surface-1` value `#141a24` (was `#111827` in `(app)`).

### `src/lib/nav/Screen.svelte`

Props: `title: string`, `back?: string` (href — renders a ‹ chevron link on the
left of the slim header for hierarchical sub-flows only), plus an `actions`
snippet and the default `children` snippet.

Renders:
1. A **slim sticky header** — `position: sticky; top: 0; height: var(--header-h);
   z-index: 20; background: --surface-1`. Contains: optional back link, the title
   (hidden until scrolled), and the `actions` snippet right-aligned (always
   visible). Gains a `border-bottom: 1px solid var(--line)` only when scrolled.
2. The **large title** (`--fs-title`) as the first block of scrolling content.
3. `children`.

Collapse logic: a `scroll` listener (passive, on `window`) sets
`scrolled = scrollY > 28`; the slim-header title and border are shown when
`scrolled`. ~15 lines, no IntersectionObserver. On SSR pages it simply starts
un-collapsed until hydration.

### `src/lib/nav/Sheet.svelte`

Props: `open = $bindable(false)`, `title?: string`, `children` snippet,
optional `foot` snippet (action buttons).

- Backdrop `rgb(0 0 0 / 0.5)` + panel sliding up from the bottom
  (`transform: translateY(100%)` → `0`, `--dur-sheet var(--ease)`).
- Panel: `--surface-1`, top corners `--r-lg`, `--shadow-sheet`, max-height 85vh,
  internal scroll, a grab handle (`--surface-3` pill) at the top,
  `padding-bottom: calc(1rem + var(--safe-b))`.
- Dismiss: backdrop click, `Escape`, swipe-down on the handle (pointer events,
  >60px), and any `foot` "Cancel"/"Done" button binding `open = false`.
- `role="dialog" aria-modal="true"`, labelled by the title. Focus moves into the
  panel on open and returns to the opener on close. Body scroll locked while open.
- Respects `@media (prefers-reduced-motion)` — no slide, just fade.

## Screens

### List — `src/routes/(app)/+page.svelte`

- **Delete** the entire `<header>` (topbar + `nav` links + `.chips` + `.placebar`)
  and the `addPlace` / `savePlace` / `deletePlace` / `editingPlace` code — that
  moves to the Stores tab.
- Wrap in `<Screen title="List">`. No header actions.
- Body: the grouped store view built on 2026-09-10 (store `.group` headers with
  grip + count + collapse caret, item rows, "Not sorted yet", then "Not carried
  here" / "Checked" sections). Restyled to `.group` / `.row` primitives + tokens.
- A store group header's **title** now navigates: `<a href={/stores/${g.place.id}}>`
  instead of `setPlace()`. The grip still drags → `move_place`. The collapse caret
  is unchanged.
- `ui.place` / `setPlace` on this screen are no longer used (the list screen is
  always the "All" view). `buildView(rows, GLOBAL)` always.
- **Quick-add bar** (`.quickadd`): `bottom: calc(var(--tabbar-h) + var(--safe-b) + var(--kb, 0px))`.
  `addItem` adds at `scope_place_id: GLOBAL` (top of "Not sorted yet").
- **Item options**: `ItemRow`'s chevron sets a parent-owned `optionsFor` id; the
  parent renders one `<Sheet>` with the controls currently in the `.edit` block
  (rename, note, qty −/+, staple, hide-here/show-here, only-here/every-store,
  remove, delete). `ItemRow`'s inline `.edit` block and its `editing` state are
  removed. The row keeps: grip, check button, label (inert), chevron.

### Stores — `src/routes/(app)/stores/+page.svelte` + `+page.ts` (new)

- `(app)` group → SPA, `ssr:false`, has the sync store.
- `<Screen title="Stores" actions={add}>` — the `actions` snippet is a `＋` button
  opening an **add-store `<Sheet>`** (a `.field` text input + Add) → `mutate({ type: 'add_place', … })`.
- Body: `.group` list of stores in `position` order. Each row: name, a
  `--text-2` count of on-list items homed there (`view` bucketed by
  `scope_place_id`), a chevron. `<a href={/stores/${id}}>` wraps the row.
- Drag handle per row → `move_place` (reuse `sortable` with `group:'stores'`).
- A trailing ⋯ button on each row opens an **edit `<Sheet>`**: rename field +
  "Delete store" (`delete_place`, with an in-sheet confirm step).
- Empty state: "No stores yet — add the places you shop."

### Store focus — `src/routes/(app)/stores/[id]/+page.svelte` + `+page.ts` (new)

- `<Screen title={storeName} back="/stores" actions={edit}>` — `back` gives the
  ‹ affordance; `edit` opens the same rename/delete `<Sheet>` as the Stores list.
- If `id` is not a live place → `goto('/stores', { replaceState: true })`.
- Body: `buildView(rows, id)` → the store's flat drag-ordered list
  (`view.items`), then its "Not carried here" (`view.hidden`) and "Checked"
  sections. Drag reorders within the store (`move_item` at `scope_place_id: id`).
- Item chevron → the **same options `<Sheet>`** as the List screen (extract it to
  `src/lib/client/ItemOptionsSheet.svelte` so both screens use one component).
- Quick-add bar present, scoped: `addItem` → `scope_place_id: id` (new items land
  at the top of this store's list).

### Items — `src/routes/(app)/catalog/+page.svelte`

- Replace the `<header>` (`‹ List` + `Items`) with `<Screen title="Items">`.
- Keep the search `.field`, the "Staples only" toggle (move into the `actions`
  slot or just under the large title), the `.item` list, and the near-duplicate
  nudge. Restyle to `.row` / `.field` / `.btn`.
- Row tap currently toggles an inline editor — move those controls (rename, note,
  star, `+ list`, delete-forever) into an **`<Sheet>`**.

### Recipes list — `src/routes/(recipes)/recipes/+page.svelte`

- Replace `.rec-topbar` (`‹ List` + `Recipes` + Import + New) with
  `<Screen title="Recipes" actions={…}>` where actions = `Import` (`.btn`) +
  `New` (`.btn-primary`), both `<a>`.
- Recipe list rows restyled to `.row`.

### Recipe detail — `src/routes/(recipes)/recipes/[id]/+page.svelte`

- Replace `.rec-topbar` with `<Screen title={tree.title} actions={…}>`. Actions:
  **Add to list** (`.btn-primary`, disabled when no candidates) + a ⋯ button
  opening a `<Sheet>` holding **Edit**, **Print**, **Delete**.
- **Add to list** opens a `<Sheet>` wrapping the existing candidate checklist
  `<form method="POST" action="?/addToList">` — open/close is client state,
  submission stays a form action.
- Serving scaler: the preset row (½–3×) stays inline under the large title. The
  **"scale to what I have"** picker moves into a `<Sheet>` (ingredient `<select>`
  + amount `.field` + Apply).
- Delete: the `?/delete` form is triggered from the overflow menu with an in-app
  confirm (small `<Sheet>` "Delete "X"? / Cancel / Delete") replacing
  `window.confirm`.
- `RecipeBody`, embed collapse, and all `@media print` rules unchanged; the
  `<Screen>` chrome must be `.noprint`.

### Recipe new / edit / import

`src/routes/(recipes)/recipes/{new,import,[id]/edit}/+page.svelte` — these are
hierarchical sub-flows, not tab destinations, and render `chromeless` (no tab
bar, see the root layout above):

- `<Screen title="New recipe" back="/recipes">` (edit: `back={/recipes/${id}}`,
  import: `back="/recipes"`). The `back` link doubles as Cancel; the `actions`
  slot stays empty here.
- Submit stays where it is: `RecipeEditor`'s existing sticky `.actions` bar
  (Save + Tidy). The import page keeps its own Import button. This avoids moving
  form-submit buttons out of their `<form>`.
- `RecipeEditor` inputs restyled via `.field`; the markup-helper buttons added
  earlier stay.

### Login — `src/routes/login/+page.svelte`

- No tab bar (`chromeless`). Restyle the card, inputs (`.field`), and button
  (`.btn-primary`) to tokens. Centered, `--surface-1` card on `--bg`.

## Cross-cutting

- **`.statusbar`** floating pill (`(app)/+layout.svelte`): restyle to
  `--surface-1` / `--accent` / `--r-full`, keep top-center position; nudge its
  `top` to clear `--safe-t`.
- **`InstallHint`**: restyle to `.btn` / tokens.
- **Service worker** (`vite.config.ts`): `/stores` and `/stores/[id]` are in the
  `(app)` SPA group → they must **not** be added to `navigateFallbackDenylist`
  (the SPA fallback should serve them). No change needed; note it so nobody adds
  them by reflex.
- **`src/routes/(app)/+layout.ts`** stays `ssr:false`; the new `/stores` routes
  inherit it.

## Testing

- **Unit** (`vitest`): no engine changes, so existing suites stay green.
  `buildView` already returns per-store buckets used by `/stores/[id]`; add a
  test that the Stores list count matches `view` bucketing if not already
  covered.
- **`npm run check`** clean; **`npm run test:unit -- --run`** green.
- **e2e** (`e2e/list.e2e.ts`) — rewrite the navigation assumptions:
  - Remove pill-based store switching (`button.chip:has-text(...)`); switch via
    the **Stores tab** → store row.
  - Add: tab bar navigates List ↔ Stores ↔ Items ↔ Recipes without Back.
  - Add store via the add-store sheet, not the `prompt()` dialog handler.
  - Item options via the sheet (`.sheet` selector) instead of the inline `.edit`.
  - "walk a store" order persists on `/stores/[id]` across reload.
  - The grouped List drag test and the "re-add keeps home store" test carry over
    (List screen unchanged in behaviour, only chrome).
- **Manual** on `listapp-dev` (`:2121`): every screen reachable from the tab bar;
  large-title collapse on scroll; each sheet opens/dismisses (backdrop, Esc,
  swipe); dark + light (`prefers-color-scheme`) both legible; print a recipe
  (chrome hidden, embeds expanded); keyboard doesn't cover the quick-add bar
  above the tab bar.

## Files

**New**
- `src/lib/styles/app.css`
- `src/lib/nav/BottomTabBar.svelte`
- `src/lib/nav/Screen.svelte`
- `src/lib/nav/Sheet.svelte`
- `src/lib/client/ItemOptionsSheet.svelte`
- `src/routes/(app)/stores/+page.svelte`, `+page.ts`
- `src/routes/(app)/stores/[id]/+page.svelte`, `+page.ts`
- `list/docs/design.md` (the permanent design-language reference)

**Modified**
- `src/routes/+layout.svelte` (tokens, stylesheet import, tab bar, theme-color)
- `src/routes/(app)/+layout.svelte` (bottom clearance, statusbar/InstallHint restyle)
- `src/routes/(recipes)/+layout.svelte` (bottom clearance, drop `.rec-*` globals)
- `src/routes/(app)/+page.svelte` (drop header/chips/placebar, `<Screen>`, options sheet, quick-add offset)
- `src/lib/client/ItemRow.svelte` (drop inline `.edit`, emit "open options")
- `src/routes/(app)/catalog/+page.svelte` (`<Screen>`, row sheet)
- `src/routes/(recipes)/recipes/+page.svelte` (`<Screen>`)
- `src/routes/(recipes)/recipes/[id]/+page.svelte` (`<Screen>`, add-to-list + scale + delete sheets)
- `src/routes/(recipes)/recipes/new/+page.svelte`, `import/+page.svelte`, `[id]/edit/+page.svelte` (`<Screen back>`)
- `src/routes/(recipes)/RecipeEditor.svelte` (`.field` restyle)
- `src/routes/login/+page.svelte` (restyle)
- `e2e/list.e2e.ts` (navigation + sheet rewrites)
- `vite.config.ts` (comment only — no denylist change)
- `README.md`, `../CLAUDE.md` (nav model, `/stores` routes, design doc pointer)

## Build sequence

1. Tokens + `app.css` primitives + type/motion. Existing screens keep working,
   look transitional.
2. `BottomTabBar` + root layout wiring + group-layout bottom clearance +
   theme-color.
3. `Screen` primitive (collapsing title).
4. `Sheet` primitive.
5. List screen: drop header/chips, adopt `Screen`, group-header link →
   `/stores/[id]`, quick-add offset, `ItemOptionsSheet`.
6. Stores tab: `/stores` + `/stores/[id]` + add/edit sheets; delete the old
   `prompt()` / inline "Edit store".
7. Items screen: `Screen` + row sheet.
8. Recipes list + detail: `Screen`, add-to-list / scale / delete sheets.
9. Recipe sub-flows: `Screen back` + Cancel/Save. `RecipeEditor` field restyle.
10. Login restyle. statusbar / InstallHint restyle.
11. e2e rewrite, unit check, docs (`design.md`, README, CLAUDE.md).

Each step ends green (`check` + `test:unit`) and is a candidate commit; ship to
`listapp-dev` for a look before `listapp`.
