# Design Language

A lightweight, dark-first token system with accessible component primitives. Follows the OS theme; no manual toggle.

## Tokens (`src/lib/styles/app.css`)

**Imported once by `src/routes/+layout.svelte`.** Dark base `:root`; light overrides via `@media (prefers-color-scheme: light)`. All values use CSS custom properties.

| Category | Tokens |
|---|---|
| **Color** | `--bg` (page), `--surface-1/2/3` (surfaces), `--text` / `--text-2` / `--text-3` (text hierarchy), `--line` / `--line-strong` (borders), `--accent` / `--accent-press` / `--accent-weak` (action color + states), `--good` / `--danger` / `--danger-weak` (semantic) |
| **Radius** | `--r-sm` (8px), `--r-md` (12px), `--r-lg` (16px), `--r-full` (999px) |
| **Type** | `--fs-title` (1.6rem), `--fs-head` (1.02rem), `--fs-body` (0.95rem), `--fs-sub` (0.82rem), `--fs-cap` (0.72rem); `--fw-title` (700), `--fw-head` (650) |
| **Motion** | `--dur-fast` (120ms), `--dur` (200ms), `--dur-sheet` (320ms), `--ease` (cubic-bezier) |
| **Layout** | `--tabbar-h` (3.25rem), `--header-h` (2.75rem), `--safe-b/t` (safe-area inset) |
| **Shadow** | `--shadow-sheet` only — borders elsewhere |

System fonts; no theme toggle.

## Primitives

### `.btn` family
Base: outlined button (2.75rem tall). Variants: `.btn-sm` (smaller), `.btn-primary` (filled accent), `.btn-tinted` (accent background weak), `.btn-plain` (no border, text-only), `.btn-danger` (danger color).

### `.field`
Input / textarea / select — 1px border, transparent background (inherits surface). `.field::-webkit-autofill` uses token overrides if needed.

### `.group` / `.group-head` / `.row`
Grouped cards: `.group` is a bordered surface with 1px divider rows inside. `.group-head` is an uppercase caption bar. `.row` is a flex row with left/center/right content. Typically used with `.group > .group-head + .row + .row`.

### `.caption`
Uppercase text (0.72rem, `--text-3`), used for labels.

### Global `:focus-visible`
2px accent outline, 4px border-radius, 2px offset.

### `@media print`
`.noprint` hides on print.

## Shell Components

### `BottomTabBar.svelte`
Fixed 4-tab bar at the bottom: List (`/`) · Stores (`/stores`) · Items (`/catalog`) · Recipes (`/recipes`). Active tab highlights via icon weight + accent color. 
- On every route **except** `/login`, `/recipes/new`, `/recipes/import`, `/recipes/<id>/edit` (the chromeless set).
- Rendered in root `(app)/+layout.svelte`.

### `Screen.svelte`
**Props:** `{ title, back?, actions?, children }` (all snippets except `title`).

A `<Screen>` provides:
- Sticky header with optional back link (chevron, accent color) and action buttons (right-aligned).
- Large title (`--fs-title`) as the first content block.
- Header border fades in once scrolled past ~28px.
- `.noprint` on header.

Used on every route with a top-level view (List, Stores, Items, Recipes, Recipe detail, etc.).

### `Sheet.svelte`
**Props:** `{ open (bindable), onClose?, title?, children, foot? }`

A bottom sheet dialog:
- Slide up from bottom with a grab handle (shows `--surface-3`).
- Backdrop fade-in; dismiss via backdrop click, Esc key, or swipe-down (60px threshold).
- Body-scroll lock; focus management (moves into sheet on open, returns to opener on close).
- `role="dialog" aria-modal`.
- Optional `foot` slot for sticky buttons at the bottom.
- `prefers-reduced-motion: reduce` → fade only, no slide.
- `.noprint`.

Used for: item options (rename/note/qty/scope/hide/remove/delete), add/edit store, delete/add-to-list/scale/⋯ on recipes, confirmation dialogs.

## Patterns

### Item Options
`ItemOptionsSheet.svelte` (shared by List + `/stores/[id]`): a `Sheet` with per-item controls (qty stepper, rename, note, staple, hide-per-place, scope, remove, delete). Opened via chevron on `ItemRow`. Returns to the row's state on close.

### Large Title + Grouping
A `<Screen title="">` reserves space for a large title, followed by grouped content (`.group` cards). On List: grouped by store (with `/stores/<id>` links). On Recipes: a linear list of recipe cards.

### Sheets for Actions
Bottom sheets for all secondary actions: edit, delete, add (with pickers), confirm destructive actions. Keeps the main view clean.

## Notes

- **No shadows except `--shadow-sheet`** — borders (`--line`, `--line-strong`) define surfaces.
- **Dark-first:** base `:root` is dark theme; light theme is `@media (prefers-color-scheme: light)` override.
- **System fonts:** no web fonts loaded.
- **Runtime keyboard height:** `--kb` is not a token. `(app)/+layout.svelte` sets it at runtime via `document.documentElement.style.setProperty('--kb', ...)` to the on-screen-keyboard height; the fixed quick-add bars offset by `var(--kb, 0px)` so the keyboard never covers them.
- **PWA meta tags:** see `src/routes/+layout.svelte`.
