# Design Language + App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `list` one dark-first design language and a persistent bottom-tab shell (List / Stores / Items / Recipes), replacing the ad-hoc per-page headers, the store pill switcher, and the `window.prompt()` for stores.

**Architecture:** A token set + one global stylesheet define the language. Three new shell primitives — `BottomTabBar`, `Screen` (collapsing large title), `Sheet` (bottom sheet) — are applied across both route groups. Store selection moves out of the list header into a new `/stores` tab plus a `/stores/[id]` focus screen; both are client-rendered pages in the existing `(app)` SPA group over the already-existing place ops. No sync-engine or schema changes.

**Tech Stack:** SvelteKit 2.63 (`adapter-node`), Svelte 5 runes, `@lucide/svelte` 1.41 (per-icon imports), `better-sqlite3`, Dexie, SortableJS (via `src/lib/client/sortable.ts`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-design-language-and-shell-design.md`

## Global Constraints

- **Svelte 5 runes only** — `$state`, `$derived`, `$props`, `$effect`, `$bindable`. No Svelte 4 stores in components except `import { page } from '$app/state'`.
- **Icons:** `@lucide/svelte` per-icon imports (`import X from '@lucide/svelte/icons/x'`). Never emoji.
- **No secure-context APIs without a fallback** — the app runs on plain `http://` on the LAN. No `crypto.randomUUID` (`src/lib/client/uuid.ts` `uuid()`), no `crypto.subtle`.
- **`localStorage` access is always wrapped in `try/catch`** (private mode throws).
- **Theme:** dark-first. Base `:root` = dark; `@media (prefers-color-scheme: light)` overrides. `color-scheme: light dark` stays. No theme toggle.
- **Fonts:** system stack only (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`). No web fonts.
- **`(app)` group is `ssr: false`; `(recipes)` group is `ssr: true`.** Do not change either.
- **Every task ends green:** `npm run check` (0 errors) and `npm run test:unit -- --run` (all pass). Page-rewrite tasks also run `npx playwright test` green.
- **Deploy for manual review:** `MSYS_NO_PATHCONV=1 bash run-list-dev.sh` → `http://localhost:2121`. Never `run-list.sh` (prod) during implementation.
- Commit messages end with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `src/lib/styles/app.css` | All design tokens + global primitives (`.btn`, `.field`, `.group`, `.row`, `.caption`). Imported once by the root layout. |
| `src/lib/nav/BottomTabBar.svelte` | The fixed 4-tab bottom navigation. Pure presentation + `page.url.pathname` active state. |
| `src/lib/nav/Screen.svelte` | Per-screen frame: slim sticky header (title + `actions` snippet + optional `back`) that reveals the title on scroll, plus a large title as the first content block. |
| `src/lib/nav/Sheet.svelte` | Reusable bottom sheet: backdrop, slide-up panel, grab handle, dismiss (backdrop / Esc / swipe-down), focus trap, body-scroll lock. |
| `src/lib/client/ItemOptionsSheet.svelte` | The item-options UI (rename / note / qty / staple / hide / scope / remove / delete), shared by the List screen and `/stores/[id]`. Wraps `Sheet`. |
| `src/routes/(app)/stores/+page.svelte` | Stores tab: list of places with counts, drag-reorder, add sheet, per-row edit sheet. |
| `src/routes/(app)/stores/[id]/+page.svelte` | One store's focused, drag-ordered list ("walk the aisles"), scoped quick-add, edit sheet. |
| `docs/design.md` | Permanent design-language reference (tokens, primitives, patterns). |

**Modified files**

| File | Change |
|---|---|
| `src/routes/+layout.svelte` | Import `app.css`; replace `:root` token block (dark-first); render `BottomTabBar` unless `chromeless`; move `theme-color` meta here. |
| `src/routes/(app)/+layout.svelte` | Bottom content clearance for the tab bar; restyle `.statusbar`; restyle via `InstallHint`. |
| `src/routes/(recipes)/+layout.svelte` | Bottom clearance; delete the `:global(.rec-*)` rules (now in `app.css`). |
| `src/routes/(app)/+page.svelte` | Delete `<header>` (topbar + chips + placebar) + place CRUD; wrap in `Screen`; store group headers link to `/stores/[id]`; quick-add offset above tab bar; item options via `ItemOptionsSheet`. |
| `src/lib/client/ItemRow.svelte` | Remove the inline `.edit` block + `editing` state; the chevron calls an `onOptions` prop. |
| `src/routes/(app)/catalog/+page.svelte` | `Screen`; row editor → `Sheet`; restyle. |
| `src/routes/(recipes)/recipes/+page.svelte` | `Screen` with Import + New actions; restyle rows. |
| `src/routes/(recipes)/recipes/[id]/+page.svelte` | `Screen` with title + Add-to-list + ⋯ sheet (Edit/Print/Delete); add-to-list, "scale to what I have", and delete become `Sheet`s. |
| `src/routes/(recipes)/recipes/new/+page.svelte`, `import/+page.svelte`, `[id]/edit/+page.svelte` | `Screen` with `back`; render `chromeless`. |
| `src/routes/(recipes)/RecipeEditor.svelte` | Inputs → `.field`; keep sticky `.actions` bar and markup buttons. |
| `src/routes/login/+page.svelte` | Restyle card / inputs / button to tokens. |
| `e2e/list.e2e.ts` | Navigation via tab bar + `/stores`; add store via sheet not `prompt()`; item options via sheet. |
| `README.md`, `../CLAUDE.md` | Nav model, `/stores` routes, design-doc pointer. |
| `vite.config.ts` | Comment only: `/stores*` stays OUT of `navigateFallbackDenylist`. |

---

## Task 1: Design tokens + global stylesheet

**Files:**
- Create: `src/lib/styles/app.css`
- Modify: `src/routes/+layout.svelte` (the `<style>` `:global(:root)` block)
- Modify: `src/routes/(recipes)/+layout.svelte` (delete the `:global(.rec-*)` rules)

**Interfaces:**
- Produces: CSS custom properties on `:root` — colour (`--bg`, `--surface-1..3`, `--text`, `--text-2`, `--text-3`, `--line`, `--line-strong`, `--accent`, `--accent-press`, `--accent-weak`, `--good`, `--danger`, `--danger-weak`), `--r-sm|md|lg|full`, `--fs-title|head|body|sub|cap`, `--fw-title|head`, `--dur-fast|dur|dur-sheet`, `--ease`, `--shadow-sheet`, `--tabbar-h`, `--header-h`, `--safe-b`, `--safe-t`. Global classes `.btn` (+ `.btn-primary|tinted|plain|danger|sm`), `.field`, `.group`, `.group-head`, `.row`, `.caption`. Back-compat aliases `.rec-btn`, `.rec-btn.primary`, `.rec-btn.danger`, `.rec-input`, `.rec-textarea`, `.link`, `.chip` remain defined here until Task 10.

- [ ] **Step 1: Create `src/lib/styles/app.css`**

```css
/* ===== tokens: dark-first ===== */
:root {
	--bg: #0b0f16;
	--surface-1: #141a24;
	--surface-2: #1c2430;
	--surface-3: #26303d;
	--text: #e8ebf0;
	--text-2: #a3adbd;
	--text-3: #6b7688;
	--line: #222c3a;
	--line-strong: #3a4658;
	--accent: #3b82f6;
	--accent-press: #2f6fd6;
	--accent-weak: rgb(59 130 246 / 0.14);
	--good: #34d399;
	--danger: #f87171;
	--danger-weak: rgb(248 113 113 / 0.13);

	--r-sm: 8px;
	--r-md: 12px;
	--r-lg: 16px;
	--r-full: 999px;

	--fs-title: 1.6rem;
	--fw-title: 700;
	--fs-head: 1.02rem;
	--fw-head: 650;
	--fs-body: 0.95rem;
	--fs-sub: 0.82rem;
	--fs-cap: 0.72rem;

	--dur-fast: 120ms;
	--dur: 200ms;
	--dur-sheet: 320ms;
	--ease: cubic-bezier(0.32, 0.72, 0, 1);

	--shadow-sheet: 0 -10px 40px rgb(0 0 0 / 0.45);

	--tabbar-h: 3.25rem;
	--header-h: 2.75rem;
	--safe-b: env(safe-area-inset-bottom, 0px);
	--safe-t: env(safe-area-inset-top, 0px);

	color-scheme: light dark;
}

@media (prefers-color-scheme: light) {
	:root {
		--bg: #ffffff;
		--surface-1: #f7f8fa;
		--surface-2: #eef1f5;
		--surface-3: #e6eaf0;
		--text: #0f172a;
		--text-2: #475569;
		--text-3: #8592a6;
		--line: #e4e8ee;
		--line-strong: #c2cad6;
		--accent: #2563eb;
		--accent-press: #1d4fd8;
		--accent-weak: rgb(37 99 235 / 0.12);
		--good: #16a34a;
		--danger: #dc2626;
		--danger-weak: rgb(220 38 38 / 0.1);
	}
}

/* ===== primitives ===== */
.btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	min-height: 2.75rem;
	padding: 0.55rem 0.9rem;
	border: 1px solid var(--line-strong);
	border-radius: var(--r-md);
	background: var(--surface-2);
	color: var(--text);
	font: inherit;
	font-size: var(--fs-body);
	line-height: 1;
	cursor: pointer;
	transition: transform var(--dur-fast) var(--ease), background var(--dur-fast);
}
.btn:active { transform: scale(0.97); }
.btn-sm { min-height: 2.1rem; padding: 0.35rem 0.6rem; font-size: var(--fs-sub); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-primary:active { background: var(--accent-press); }
.btn-tinted { background: var(--accent-weak); border-color: transparent; color: var(--accent); }
.btn-plain { background: none; border-color: transparent; color: var(--accent); min-height: auto; padding: 0.3rem 0.4rem; }
.btn-danger { color: var(--danger); }
.btn:disabled { opacity: 0.45; pointer-events: none; }

.field {
	width: 100%;
	padding: 0.6rem 0.7rem;
	border: 1px solid var(--line-strong);
	border-radius: var(--r-md);
	background: var(--surface-2);
	color: var(--text);
	font: inherit;
	font-size: var(--fs-body);
}
textarea.field { resize: vertical; min-height: 3rem; }

.group {
	background: var(--surface-1);
	border: 1px solid var(--line);
	border-radius: var(--r-md);
	overflow: hidden;
}
.group + .group { margin-top: 0.8rem; }
.group-head {
	font-size: var(--fs-cap);
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--text-3);
	padding: 0.5rem 0.7rem 0.3rem;
}
.row {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	min-height: 2.9rem;
	padding: 0.4rem 0.7rem;
	border-top: 1px solid var(--line);
}
.group .row:first-child, .group-head + .row { border-top: 0; }

.caption { font-size: var(--fs-cap); text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); }

:where(a, button, input, textarea, select, [tabindex]):focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 2px;
	border-radius: 4px;
}

/* ===== back-compat aliases (removed in Task 10) ===== */
.rec-btn { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.4rem; padding: 0.5rem 0.8rem; border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--surface-2); color: var(--text); font: inherit; font-size: var(--fs-sub); }
.rec-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.rec-btn.danger { color: var(--danger); }
.rec-input, .rec-textarea { width: 100%; padding: 0.6rem 0.7rem; border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--surface-2); color: inherit; font: inherit; }
.rec-textarea { resize: vertical; min-height: 3rem; }
.link { background: none; border: 0; color: var(--accent); font-size: var(--fs-sub); text-decoration: none; padding: 0.2rem; cursor: pointer; }
.chip { flex: none; padding: 0.45rem 0.85rem; border: 1px solid var(--line); border-radius: var(--r-full); background: var(--surface-2); font-size: var(--fs-body); white-space: nowrap; }
.chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }

:global(.drag-ghost) { opacity: 0.4; }
```

- [ ] **Step 2: Point the root layout at `app.css` and drop its inline token block**

In `src/routes/+layout.svelte`:
- Add to `<script>`: `import '$lib/styles/app.css';`
- In the `<style>` block, **delete** the entire `:global(:root){…}` rule and the `@media (prefers-color-scheme: dark){…}` rule (now in `app.css`).
- Keep the `:global(html), :global(body)` rule but change its `font` line to `font: var(--fs-body)/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;` and keep `background: var(--bg); color: var(--text); overscroll-behavior-y: none;`.
- Keep `:global(*){box-sizing:border-box}` and `:global(button){font:inherit;color:inherit;cursor:pointer}`.
- Delete the `:global(.drag-ghost)` rule (moved to `app.css`).

- [ ] **Step 3: Delete the `.rec-*` globals from the recipes layout**

In `src/routes/(recipes)/+layout.svelte` `<style>`, delete every `:global(.rec-topbar)`, `:global(.rec-topbar .spacer)`, `:global(.rec-link)`, `:global(.rec-btn)`, `:global(.rec-btn.primary)`, `:global(.rec-btn.danger)`, `:global(.rec-input)`, `:global(.rec-textarea)` rule. Keep only the `.wrap` rule and its `@media print`. Add this one back (still referenced by markup until Task 8):

```css
:global(.rec-topbar) { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.4rem 0; border-bottom: 1px solid var(--line); margin-bottom: 0.8rem; }
:global(.rec-topbar .spacer) { flex: 1; }
:global(.rec-link) { color: var(--accent); text-decoration: none; font-size: var(--fs-sub); }
```

- [ ] **Step 4: Verify build + existing tests**

Run: `npm run check`
Expected: 0 errors, 0 warnings.

Run: `npm run test:unit -- --run`
Expected: all pass (104+).

Run: `npm run build`
Expected: `✔ done`.

- [ ] **Step 5: Manual smoke on dev**

Run: `MSYS_NO_PATHCONV=1 bash run-list-dev.sh`
Open `http://localhost:2121` — the list, `/catalog`, `/recipes` all render (transitional look is fine). Toggle OS dark/light — both legible, no invisible text or borders.

- [ ] **Step 6: Commit**

```bash
git add src/lib/styles/app.css src/routes/+layout.svelte "src/routes/(recipes)/+layout.svelte"
git commit -m "design: dark-first token system + global primitives stylesheet"
```

---

## Task 2: Bottom tab bar + shell wiring

**Files:**
- Create: `src/lib/nav/BottomTabBar.svelte`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/(app)/+layout.svelte`
- Modify: `src/routes/(recipes)/+layout.svelte`
- Test: `e2e/list.e2e.ts` (new test)

**Interfaces:**
- Consumes: `import { page } from '$app/state'` (`page.url.pathname`).
- Produces: `BottomTabBar` (no props). Root layout exposes no new interface. `--tabbar-h` from Task 1.

- [ ] **Step 1: Write the failing e2e test**

Add to `e2e/list.e2e.ts` (after the existing helpers, before the first `test(`):

```ts
test('bottom tab bar navigates between sections without Back', async ({ page }) => {
	await expect(page.locator('nav.tabbar a[aria-current="page"]')).toHaveText(/List/);

	await page.locator('nav.tabbar a', { hasText: 'Items' }).click();
	await expect(page).toHaveURL(/\/catalog$/);
	await expect(page.locator('nav.tabbar a[aria-current="page"]')).toHaveText(/Items/);

	await page.locator('nav.tabbar a', { hasText: 'Recipes' }).click();
	await expect(page).toHaveURL(/\/recipes$/);

	await page.locator('nav.tabbar a', { hasText: 'List' }).click();
	await expect(page).toHaveURL(/\/$/);
});

test('no tab bar on the login screen', async ({ page, context }) => {
	await context.clearCookies();
	await page.goto('/login');
	await expect(page.locator('nav.tabbar')).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test -g "bottom tab bar navigates"`
Expected: FAIL — `nav.tabbar` not found.

- [ ] **Step 3: Create `src/lib/nav/BottomTabBar.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import List from '@lucide/svelte/icons/list';
	import Store from '@lucide/svelte/icons/store';
	import Package from '@lucide/svelte/icons/package';
	import BookOpen from '@lucide/svelte/icons/book-open';

	const tabs = [
		{ href: '/', label: 'List', icon: List, match: (p: string) => p === '/' },
		{ href: '/stores', label: 'Stores', icon: Store, match: (p: string) => p.startsWith('/stores') },
		{ href: '/catalog', label: 'Items', icon: Package, match: (p: string) => p === '/catalog' },
		{ href: '/recipes', label: 'Recipes', icon: BookOpen, match: (p: string) => p.startsWith('/recipes') }
	];
	const path = $derived(page.url.pathname);
</script>

<nav class="tabbar">
	{#each tabs as t (t.href)}
		{@const active = t.match(path)}
		<a href={t.href} class:active aria-current={active ? 'page' : undefined}>
			<t.icon size={22} strokeWidth={active ? 2.4 : 2} />
			<span>{t.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		height: calc(var(--tabbar-h) + var(--safe-b));
		padding-bottom: var(--safe-b);
		background: color-mix(in srgb, var(--surface-1) 88%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-top: 1px solid var(--line);
	}
	.tabbar a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.15rem;
		text-decoration: none;
		color: var(--text-3);
		font-size: var(--fs-cap);
	}
	.tabbar a.active { color: var(--accent); font-weight: var(--fw-head); }
	@media print { .tabbar { display: none; } }
</style>
```

- [ ] **Step 4: Wire the root layout**

Replace the whole of `src/routes/+layout.svelte` with:

```svelte
<script lang="ts">
	import '$lib/styles/app.css';
	import { page } from '$app/state';
	import BottomTabBar from '$lib/nav/BottomTabBar.svelte';
	let { children } = $props();

	const p = $derived(page.url.pathname);
	const chromeless = $derived(
		p === '/login' ||
			p === '/recipes/new' ||
			p === '/recipes/import' ||
			/^\/recipes\/[^/]+\/edit$/.test(p)
	);
</script>

<svelte:head><meta name="theme-color" content="#141a24" /></svelte:head>

{@render children?.()}
{#if !chromeless}<BottomTabBar />{/if}

<style>
	:global(html),
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font: var(--fs-body) / 1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		overscroll-behavior-y: none;
	}
	:global(*) { box-sizing: border-box; }
	:global(button) { font: inherit; color: inherit; cursor: pointer; }
</style>
```

- [ ] **Step 5: Bottom clearance in both group layouts**

In `src/routes/(app)/+layout.svelte`: wrap the existing `{@render children?.()}` in
`<div class="group-scroll">{@render children?.()}</div>` and add to `<style>`:

```css
.group-scroll { padding-bottom: calc(var(--tabbar-h) + var(--safe-b) + 0.5rem); min-height: 100vh; }
```

In `src/routes/(recipes)/+layout.svelte` `<style>`, change `.wrap`'s padding to:
`padding: 0.5rem 0.7rem calc(var(--tabbar-h) + var(--safe-b) + 0.5rem);`
Keep the `@media print { .wrap { padding: 0; } }`.

- [ ] **Step 6: Remove the old `theme-color` from the app layout**

In `src/routes/(app)/+layout.svelte`, delete the `<svelte:head><meta name="theme-color" …></svelte:head>` block (now in the root layout).

- [ ] **Step 7: Run the e2e test + full check**

Run: `npx playwright test -g "bottom tab bar navigates"` then `npx playwright test -g "no tab bar on the login"`
Expected: PASS.

Run: `npm run check` → 0 errors. Run: `npm run test:unit -- --run` → all pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/nav/BottomTabBar.svelte src/routes/+layout.svelte "src/routes/(app)/+layout.svelte" "src/routes/(recipes)/+layout.svelte" e2e/list.e2e.ts
git commit -m "feat: persistent bottom tab bar (List / Stores / Items / Recipes)"
```

---

## Task 3: `Screen` primitive + adopt on Items

**Files:**
- Create: `src/lib/nav/Screen.svelte`
- Modify: `src/routes/(app)/catalog/+page.svelte`
- Test: `e2e/list.e2e.ts` (extend the existing "Items screen" test)

**Interfaces:**
- Produces: `Screen` — props `title: string`, `back?: string` (href), snippets `actions?` and `children` (default). Renders a `<header class="screen-head">` (sticky, contains optional back link + title shown only when `scrolled` + `actions` right-aligned) and an `<h1 class="screen-title">` as the first body block, then `children`. Adds/removes `data-scrolled` on the header.

- [ ] **Step 1: Create `src/lib/nav/Screen.svelte`**

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';

	let {
		title,
		back,
		actions,
		children
	}: {
		title: string;
		back?: string;
		actions?: Snippet;
		children: Snippet;
	} = $props();

	let scrolled = $state(false);
	$effect(() => {
		const onScroll = () => (scrolled = window.scrollY > 28);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<header class="screen-head noprint" data-scrolled={scrolled || undefined}>
	{#if back}
		<a class="back" href={back} aria-label="Back"><ChevronLeft size={22} /></a>
	{/if}
	<span class="peek-title">{title}</span>
	<span class="spacer"></span>
	{#if actions}<span class="actions">{@render actions()}</span>{/if}
</header>

<h1 class="screen-title">{title}</h1>
{@render children()}

<style>
	.screen-head {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		height: var(--header-h);
		padding: 0 0.7rem;
		background: var(--surface-1);
		border-bottom: 1px solid transparent;
		transition: border-color var(--dur);
	}
	.screen-head[data-scrolled] { border-bottom-color: var(--line); }
	.back { display: grid; place-items: center; color: var(--accent); margin-left: -0.3rem; }
	.peek-title {
		font-weight: var(--fw-head);
		opacity: 0;
		transition: opacity var(--dur);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.screen-head[data-scrolled] .peek-title { opacity: 1; }
	.spacer { flex: 1; }
	.actions { display: flex; align-items: center; gap: 0.4rem; flex: none; }
	.screen-title {
		margin: 0.3rem 0 0.7rem;
		padding: 0 0.7rem;
		font-size: var(--fs-title);
		font-weight: var(--fw-title);
		letter-spacing: -0.01em;
	}
	@media print { .screen-title { padding: 0; } }
</style>
```

- [ ] **Step 2: Adopt on the Items screen**

In `src/routes/(app)/catalog/+page.svelte`:
- `<script>`: add `import Screen from '$lib/nav/Screen.svelte';`
- Replace the entire `<header>…</header>` block with the opening of a `Screen`:

```svelte
<Screen title="Items">
	{#snippet actions()}
		<label class="staple-toggle"><input type="checkbox" bind:checked={staplesOnly} /> Staples</label>
	{/snippet}

	<div class="tools">
		<input class="field" bind:value={q} placeholder="Search items"
			onkeydown={(e) => e.key === 'Enter' && !filtered.length && newItem()} />
	</div>
```

- Change the closing `</main>` to `</Screen>` and delete the now-unused `<main>` open tag (move its children directly under `Screen`). Keep the `{#if dupeGroups…}`, `{#if !filtered.length}`, and `{#each filtered…}` blocks as direct children of `Screen`.
- In `<style>`: delete the `header`, `.topbar`, `.topbar strong`, `.tools` (old) rules; add:

```css
.tools { padding: 0 0.7rem 0.6rem; }
.staple-toggle { display: flex; align-items: center; gap: 0.3rem; font-size: var(--fs-sub); color: var(--text-2); }
```

- Leave the `.item`, `.line`, `.dupes`, etc. styles for now (Task 4 restyles the rows).

- [ ] **Step 3: Extend the Items e2e test**

In `e2e/list.e2e.ts`, in the existing test `'Items screen: staples filter, edit, delete, add back to list'`, change the first assertion after navigating to `/catalog`:

```ts
await page.click('nav.tabbar a:has-text("Items")');
await expect(page.locator('h1.screen-title')).toHaveText('Items');
```
(replace the old `await page.click('a[href="/catalog"]')` line; keep the rest of the test, but replace every later `await page.click('a[href="/"]')` with `await page.click('nav.tabbar a:has-text("List")')`.)

- [ ] **Step 4: Verify**

Run: `npx playwright test -g "Items screen"` → PASS.
Run: `npm run check` → 0 errors. `npm run test:unit -- --run` → all pass.

- [ ] **Step 5: Manual on dev**

`MSYS_NO_PATHCONV=1 bash run-list-dev.sh`; open `/catalog`; scroll — the large "Items" title scrolls away and the slim header gains its title + bottom border.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav/Screen.svelte "src/routes/(app)/catalog/+page.svelte" e2e/list.e2e.ts
git commit -m "feat: Screen primitive (collapsing large title); adopt on Items"
```

---

## Task 4: `Sheet` primitive + Items row → sheet

**Files:**
- Create: `src/lib/nav/Sheet.svelte`
- Modify: `src/routes/(app)/catalog/+page.svelte`
- Test: `e2e/list.e2e.ts`

**Interfaces:**
- Produces: `Sheet` — props `open = $bindable(false)`, `title?: string`, snippets `children` and `foot?`. Renders nothing when closed. When open: `.sheet-backdrop` + `.sheet-panel[role=dialog][aria-modal=true]` with a grab handle, `title` as `<h2>`, `children`, then `foot`. Dismiss on backdrop click, `Escape`, swipe-down >60px on the handle. Locks `document.body` scroll while open. Emits nothing — parent binds `open`.

- [ ] **Step 1: Create `src/lib/nav/Sheet.svelte`**

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		children,
		foot
	}: { open?: boolean; title?: string; children: Snippet; foot?: Snippet } = $props();

	let panel = $state<HTMLElement>();
	let dragY = $state(0);

	$effect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (open = false);
		window.addEventListener('keydown', onKey);
		panel?.focus();
		return () => {
			document.body.style.overflow = prev;
			window.removeEventListener('keydown', onKey);
		};
	});

	let start = 0;
	function down(e: PointerEvent) {
		start = e.clientY;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!start) return;
		dragY = Math.max(0, e.clientY - start);
	}
	function up() {
		if (dragY > 60) open = false;
		start = 0;
		dragY = 0;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="sheet-backdrop noprint" onclick={() => (open = false)}></div>
	<div
		class="sheet-panel noprint"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		bind:this={panel}
		style="transform: translateY({dragY}px)"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="grip" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
			<span></span>
		</div>
		{#if title}<h2>{title}</h2>{/if}
		<div class="body">{@render children()}</div>
		{#if foot}<div class="foot">{@render foot()}</div>{/if}
	</div>
{/if}

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgb(0 0 0 / 0.5);
		animation: fade var(--dur) both;
	}
	.sheet-panel {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 51;
		max-height: 85vh;
		overflow-y: auto;
		background: var(--surface-1);
		border-radius: var(--r-lg) var(--r-lg) 0 0;
		box-shadow: var(--shadow-sheet);
		padding: 0 1rem calc(1rem + var(--safe-b));
		animation: rise var(--dur-sheet) var(--ease) both;
	}
	.grip { display: grid; place-items: center; padding: 0.6rem 0; touch-action: none; cursor: grab; }
	.grip span { width: 2.2rem; height: 0.28rem; border-radius: var(--r-full); background: var(--surface-3); }
	h2 { margin: 0 0 0.6rem; font-size: var(--fs-head); font-weight: var(--fw-head); }
	.body { display: flex; flex-direction: column; gap: 0.6rem; }
	.foot { display: flex; gap: 0.5rem; margin-top: 0.9rem; }
	@keyframes rise { from { transform: translateY(100%); } }
	@keyframes fade { from { opacity: 0; } }
	@media (prefers-reduced-motion: reduce) {
		.sheet-panel, .sheet-backdrop { animation-duration: 1ms; }
	}
</style>
```

- [ ] **Step 2: Replace the Items inline editor with a Sheet**

In `src/routes/(app)/catalog/+page.svelte`:
- `<script>`: `import Sheet from '$lib/nav/Sheet.svelte';`
- Replace the `editing` string state usage: keep `let editing = $state<string | null>(null)`. Add `const editingItem = $derived(items.find((i) => i.id === editing) ?? null);`
- The row `<button class="body" onclick={() => (editing === i.id ? (editing = null) : open(i))}>` becomes `onclick={() => open(i)}` (always opens).
- Delete the inline `{#if editing === i.id}<div class="edit">…</div>{/if}` block inside the `{#each}`.
- After the `{#each filtered}` loop (still inside `Screen`), add:

```svelte
<Sheet open={editing !== null} title={editingItem?.name ?? 'Item'}>
	{#if editingItem}
		<input class="field" bind:value={draftName} placeholder="Name" />
		<input class="field" bind:value={draftNote} placeholder="Note (2%, big jug…)" />
		<label class="staple-toggle">
			<input type="checkbox" checked={editingItem.is_staple}
				onchange={(e) => mutate({ type: 'set_staple', item_id: editingItem.id, is_staple: e.currentTarget.checked })} />
			Staple
		</label>
	{/if}
	{#snippet foot()}
		<button class="btn btn-danger" onclick={() => editingItem && del(editingItem)}>Delete</button>
		<span style="flex:1"></span>
		<button class="btn" onclick={() => (editing = null)}>Cancel</button>
		<button class="btn btn-primary" onclick={() => editingItem && save(editingItem)}>Done</button>
	{/snippet}
</Sheet>
```

- Update `del()` and `save()` to also set `editing = null` at the end if they don't already.
- `<style>`: delete `.edit`, `.editbtns`, `.item.open` rules.

- [ ] **Step 3: Update the Items e2e test for the sheet**

In `e2e/list.e2e.ts` `'Items screen'` test, the parts that open the inline editor now open a sheet — change:

```ts
// old: await page.click('.item:has-text("Sugar") .body');
await page.click('.item:has-text("Sugar") .body');
await expect(page.locator('.sheet-panel')).toBeVisible();
page.once('dialog', (d) => d.accept());
await page.click('.sheet-panel button:has-text("Delete")');
await expect(page.locator('.item:has-text("Sugar")')).toHaveCount(0);
```

- [ ] **Step 4: Verify**

Run: `npx playwright test -g "Items screen"` → PASS.
`npm run check` → 0 errors. `npm run test:unit -- --run` → all pass.

- [ ] **Step 5: Manual on dev** — open an item on `/catalog`; sheet rises; Esc, backdrop tap, and swipe-down each dismiss it; edits persist.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav/Sheet.svelte "src/routes/(app)/catalog/+page.svelte" e2e/list.e2e.ts
git commit -m "feat: Sheet primitive; Items row editor becomes a bottom sheet"
```

---

## Task 5: List screen — Screen frame, drop header/chips, options sheet

**Files:**
- Create: `src/lib/client/ItemOptionsSheet.svelte`
- Modify: `src/routes/(app)/+page.svelte`
- Modify: `src/lib/client/ItemRow.svelte`
- Test: `e2e/list.e2e.ts`

**Interfaces:**
- Consumes: `Screen`, `Sheet`, `buildView`, `mutate`, `keys`, `resolvePlacement`, `GLOBAL`, `sortable`.
- Produces: `ItemOptionsSheet` — props `item: ItemView | null` (sheet is open iff non-null), `place: string` (current scope: `GLOBAL` on the list screen, the store id on `/stores/[id]`), `scopeName: string`, `onClose: () => void`. Emits mutations directly via `mutate`. `ItemRow` gains prop `onOptions: (item: ItemView) => void` and loses `editing`.

- [ ] **Step 1: Create `src/lib/client/ItemOptionsSheet.svelte`**

Move the entire body of `ItemRow.svelte`'s current `{#if editing && !arrange}<div class="edit">…</div>` into this component, converted to a `Sheet`. Full file:

```svelte
<script lang="ts">
	import type { ItemView } from './view';
	import { mutate } from './store.svelte';
	import Sheet from '$lib/nav/Sheet.svelte';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';

	let {
		item,
		place,
		scopeName = '',
		onClose
	}: { item: ItemView | null; place: string; scopeName?: string; onClose: () => void } = $props();

	let name = $state('');
	let note = $state('');
	$effect(() => {
		if (item) {
			name = item.name;
			note = item.note;
		}
	});

	const placeSelected = $derived(place !== '');
	const pinnedHere = $derived(!!item && item.scope_place_id === place && placeSelected);
	const pinnedElsewhere = $derived(!!item && item.scope_place_id !== '' && item.scope_place_id !== place);

	function setQty(q: number) {
		if (item) mutate({ type: 'set_qty', item_id: item.id, qty: Math.max(1, q) });
	}
	function save() {
		if (!item) return;
		if (name.trim() && name.trim() !== item.name) mutate({ type: 'rename_item', item_id: item.id, name: name.trim() });
		if (note !== item.note) mutate({ type: 'set_note', item_id: item.id, note });
		onClose();
	}
	function toggleHide() {
		if (item) mutate({ type: 'hide_item', item_id: item.id, scope_place_id: place, hidden: !item.hidden });
		onClose();
	}
	function setScope(scope: string) {
		if (item) mutate({ type: 'set_item_scope', item_id: item.id, scope_place_id: scope });
		onClose();
	}
	function removeFromList() {
		if (item) mutate({ type: 'remove_from_list', item_id: item.id });
		onClose();
	}
	function deleteForever() {
		if (item) mutate({ type: 'delete_item', item_id: item.id });
		onClose();
	}
</script>

<Sheet open={item !== null} title={item?.name ?? 'Item'}>
	{#if item}
		<input class="field" bind:value={name} placeholder="Name" />
		<input class="field" bind:value={note} placeholder="Note (2%, big jug…)" />
		<div class="qtyrow">
			<span class="caption">Quantity</span>
			<div class="stepper">
				<button aria-label="Less" onclick={() => setQty(item.qty - 1)}><Minus size={16} /></button>
				<span>{item.qty}</span>
				<button aria-label="More" onclick={() => setQty(item.qty + 1)}><Plus size={16} /></button>
			</div>
		</div>
		<label class="staple">
			<input type="checkbox" checked={item.is_staple}
				onchange={(e) => mutate({ type: 'set_staple', item_id: item.id, is_staple: e.currentTarget.checked })} />
			Staple
		</label>
		<div class="acts">
			{#if placeSelected}
				<button class="btn" onclick={toggleHide}>{item.hidden ? 'Show here' : 'Hide here'}</button>
				{#if pinnedHere}
					<button class="btn" onclick={() => setScope('')}>Show at every store</button>
				{:else}
					<button class="btn" onclick={() => setScope(place)}>Only show here</button>
				{/if}
			{:else if pinnedElsewhere}
				<button class="btn" onclick={() => setScope('')}>Only at {scopeName || 'one store'} — show everywhere</button>
			{/if}
			<button class="btn" onclick={removeFromList}>Remove from list</button>
			<button class="btn btn-danger" onclick={deleteForever}>Delete forever</button>
		</div>
	{/if}
	{#snippet foot()}
		<span style="flex:1"></span>
		<button class="btn" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" onclick={save}>Done</button>
	{/snippet}
</Sheet>

<style>
	.qtyrow { display: flex; align-items: center; justify-content: space-between; }
	.stepper { display: flex; align-items: center; gap: 0.3rem; border: 1px solid var(--line-strong); border-radius: var(--r-md); overflow: hidden; }
	.stepper button { display: grid; place-items: center; width: 2.4rem; height: 2.4rem; border: 0; background: var(--surface-2); }
	.stepper span { min-width: 1.6rem; text-align: center; font-variant-numeric: tabular-nums; }
	.staple { display: flex; align-items: center; gap: 0.4rem; font-size: var(--fs-sub); color: var(--text-2); }
	.acts { display: flex; flex-direction: column; gap: 0.4rem; }
	.acts .btn { justify-content: flex-start; }
</style>
```

- [ ] **Step 2: Strip `ItemRow.svelte` down to the row**

- Remove props `editing` and add `onOptions: (item: ItemView) => void`.
- Delete the entire `{#if editing}…{/if}` block at the bottom, the `openEditor`, `name`, `note`, `saveEdit`, `toggleHide`, `setScope`, `setQty`, `toggleHide`, `removeFromList`, `deleteForever` functions, and the imports only they used (`Minus`, `Plus`). Keep `GripVertical`, `Check`, `ChevronRight`.
- The chevron button becomes: `onclick={() => onOptions(item)}` and drop the `class:open` / rotate.
- Keep the swipe-to-check (`down`/`move`/`up`, `dx`, `start`, `swiping`) and `toggleCheck`.
- Restyle to tokens in `<style>`: `.check .dot` border → `var(--line-strong)`; `.check .dot.on` background → `var(--good)`; `.row` border-bottom → `var(--line)`; `.row:has(.swiping)` gradient stop colour → `var(--good)`; `.nt`/`.qty` colour → `var(--text-2)`.

- [ ] **Step 3: Rewrite the List page frame**

In `src/routes/(app)/+page.svelte`:
- Delete imports `Plus`, `ArrowUpDown`; add `import Screen from '$lib/nav/Screen.svelte';` and `import ItemOptionsSheet from '$lib/client/ItemOptionsSheet.svelte';`
- Delete state/functions: `arrange`, `editingPlace`, `placeName`, `savePlace`, `deletePlace`, `addPlace`, `onPlaceMove`, `placeSelected`, and the `setPlace` import.
- `const view = $derived(buildView(rows, GLOBAL));` (always the All view).
- Add `let optionsFor = $state<ItemView | null>(null);` (import type `ItemView` from `$lib/client/view`).
- `addItem`: `scope_place_id: GLOBAL`, `position: keys.before(loose.items[0]?.position ?? null)`.
- Delete the entire `<header>…</header>` block.
- Wrap the body in `<Screen title="List"> … </Screen>` (no actions).
- Store group header: replace `<button class="gname" onclick={() => setPlace(g.place!.id)}>` with `<a class="gname" href={/stores/${g.place!.id}}>`. Keep the grip (`onPlaceMove` is gone — drop the `.groups` `use:sortable` wrapper and its handle for now; store reordering lives on `/stores` in Task 6). So the outer `<ul class="groups" use:sortable=…>` becomes a plain `<div class="groups">` and each `<li class="group">` a `<div class="group">`; remove `.place-handle` spans.
- Each item row: `<ItemRow item={it} place={GLOBAL} scopeName={placeNameOf(it.scope_place_id)} onOptions={(x) => (optionsFor = x)} />`
- After the groups + extra sections, before `</Screen>`, add:
  `<ItemOptionsSheet item={optionsFor} place={GLOBAL} scopeName={optionsFor ? placeNameOf(optionsFor.scope_place_id) : ''} onClose={() => (optionsFor = null)} />`
- Quick-add `<footer class="quickadd">` stays but move it OUTSIDE `Screen` (sibling), and change its CSS `bottom` to `calc(var(--tabbar-h) + var(--safe-b) + var(--kb, 0px))`.
- `<style>`: delete `header`, `.topbar*`, `.link*`, `.chips`, `.chip*`, `.placebar*`, `.arrangehint`, `main.arranging`, `.firstrun` (keep a simple version), `.groups`/`.group`/`.ghead` stay but retune to tokens; `.gname` becomes `a` styled as before (`text-decoration:none; color:var(--text-2)`).

- [ ] **Step 4: Update List e2e tests**

In `e2e/list.e2e.ts`:
- Every `setArrange` / `arrange` reference is already gone (removed earlier). Confirm no `.chip` selectors remain in List tests — the tests that used `button.chip:has-text("Costco")` move to Task 6. For now, mark those specific tests `test.skip` with a comment `// re-enabled in the Stores-tab task` if they block: `'a per-store order does not change the item in the All view'`, `'an item added inside a store only appears there'`, `'"only show here" pins…'`, `'hide an item for one store only'`.
- The item-options tests (`'typing a quantity bumps one item, and the stepper adjusts it'`) — the stepper is now in the sheet: after `openRow(page, 'milk')` add `await expect(page.locator('.sheet-panel')).toBeVisible();` and target `.sheet-panel button[aria-label="Less"]`.
- `openRow` helper: change `.chev` click to still click `.chev` (kept) — it now opens the sheet.

- [ ] **Step 5: Verify**

Run: `npm run check` → 0 errors.
Run: `npm run test:unit -- --run` → all pass.
Run: `npx playwright test` → all pass (some `test.skip` expected, no failures).

- [ ] **Step 6: Manual on dev** — list renders under a large "List" title; store headers link to `/stores/<id>` (404 until Task 6 — that's expected, note it); item chevron opens the options sheet; quick-add sits above the tab bar; keyboard doesn't cover it.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(app)/+page.svelte" src/lib/client/ItemRow.svelte src/lib/client/ItemOptionsSheet.svelte e2e/list.e2e.ts
git commit -m "feat: List screen on Screen frame; item options + edit become sheets"
```

---

## Task 6: Stores tab — `/stores` and `/stores/[id]`

**Files:**
- Create: `src/routes/(app)/stores/+page.svelte`
- Create: `src/routes/(app)/stores/[id]/+page.svelte`
- Modify: `e2e/list.e2e.ts` (un-skip + rewrite the store tests)
- Modify: `vite.config.ts` (comment only)

**Interfaces:**
- Consumes: `ui`, `currentRows`, `mutate`, `keys` from `store.svelte`; `buildView` from `view`; `sortable`; `Screen`, `Sheet`, `ItemOptionsSheet`, `AddItemBox`, `ItemRow`; `page` from `$app/state` for `[id]`.
- Produces: two routes. No new module exports.

- [ ] **Step 1: Write the failing e2e test**

Replace the four skipped tests from Task 5 with rewrites that use the Stores tab. Example for the first:

```ts
test('a per-store order does not change the item in the All view', async ({ page }) => {
	await addItem(page, 'Rice');
	await addItem(page, 'Beans');

	await page.click('nav.tabbar a:has-text("Stores")');
	await page.click('h1.screen-title:has-text("Stores") ~ * button[aria-label="Add store"], .screen-head button[aria-label="Add store"]');
	await page.fill('.sheet-panel input.field', 'Costco');
	await page.click('.sheet-panel button:has-text("Add")');
	await page.click('.store-row:has-text("Costco")');
	await expect(page).toHaveURL(/\/stores\/[^/]+$/);

	await drag(page, 'Rice', 'Beans'); // reorder within Costco
	await expect.poll(() => listOrder(page)).toEqual(['Beans', 'Rice']);

	await page.click('nav.tabbar a:has-text("List")');
	// All view "Not sorted yet" still by add order
	await expect.poll(() => listOrder(page)).toEqual(['Beans', 'Rice']);
});
```

Add a helper near the top:
```ts
async function addStore(page: Page, name: string) {
	await page.click('nav.tabbar a:has-text("Stores")');
	await page.click('.screen-head button[aria-label="Add store"]');
	await page.fill('.sheet-panel input.field', name);
	await page.click('.sheet-panel button:has-text("Add")');
	await expect(page.locator(`.store-row:has-text("${name}")`)).toBeVisible();
}
```
Rewrite the other three store tests to use `addStore` + `.store-row` navigation instead of `button.chip.add` / `dialog` / `button.chip:has-text(...)`.

- [ ] **Step 2: Run to confirm failure**

Run: `npx playwright test -g "per-store order"`
Expected: FAIL — `/stores` is 404.

- [ ] **Step 3: Create `src/routes/(app)/stores/+page.svelte`**

```svelte
<script lang="ts">
	import { ui, currentRows, mutate, keys } from '$lib/client/store.svelte';
	import { buildView } from '$lib/client/view';
	import Screen from '$lib/nav/Screen.svelte';
	import Sheet from '$lib/nav/Sheet.svelte';
	import { sortable, type SortableMove } from '$lib/client/sortable';
	import Plus from '@lucide/svelte/icons/plus';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { uuid } from '$lib/client/uuid';

	const rows = $derived.by(() => {
		ui.rev;
		return currentRows();
	});
	const view = $derived(buildView(rows, ''));
	const countFor = (id: string) =>
		view.groups.find((g) => g.place?.id === id)?.items.length ?? 0;

	let adding = $state(false);
	let newName = $state('');
	function addStore() {
		const n = newName.trim();
		if (!n) return;
		const last = view.places.at(-1)?.position ?? null;
		mutate({ type: 'add_place', place_id: uuid(), name: n, position: keys.after(last) });
		newName = '';
		adding = false;
	}

	let editId = $state<string | null>(null);
	const editing = $derived(view.places.find((p) => p.id === editId) ?? null);
	let editName = $state('');
	$effect(() => { if (editing) editName = editing.name; });
	function saveStore() {
		if (editing && editName.trim() && editName.trim() !== editing.name)
			mutate({ type: 'rename_place', place_id: editing.id, name: editName.trim() });
		editId = null;
	}
	function deleteStore() {
		if (editing && confirm(`Delete “${editing.name}”? Items stay on the list.`))
			mutate({ type: 'delete_place', place_id: editing.id });
		editId = null;
	}

	function onMove(m: SortableMove) {
		const pos = (id: string | undefined) =>
			id ? rows.places.get(id)?.position ?? null : null;
		mutate({
			type: 'move_place',
			place_id: m.itemId,
			position: keys.between(pos(m.toOrder[m.newIndex - 1]), pos(m.toOrder[m.newIndex + 1]))
		});
	}
</script>

<svelte:head><title>Stores</title></svelte:head>

<Screen title="Stores">
	{#snippet actions()}
		<button class="btn btn-tinted btn-sm" aria-label="Add store" onclick={() => (adding = true)}>
			<Plus size={18} /> Add
		</button>
	{/snippet}

	{#if !view.places.length}
		<p class="empty">No stores yet — add the places you shop.</p>
	{/if}

	<ul class="group" data-zone="__stores__"
		use:sortable={{ group: 'stores', zone: '__stores__', handle: '.store-handle', onMove }}>
		{#each view.places as p (p.id)}
			<li class="row store-row" data-id={p.id}>
				<span class="store-handle" aria-hidden="true"><GripVertical size={18} /></span>
				<a class="grow" href={`/stores/${p.id}`}>
					<span class="nm">{p.name}</span>
					<span class="ct">{countFor(p.id)}</span>
				</a>
				<button class="more" aria-label={`Edit ${p.name}`} onclick={() => (editId = p.id)}>
					<MoreHorizontal size={18} />
				</button>
				<a class="chev" href={`/stores/${p.id}`} aria-hidden="true" tabindex="-1"><ChevronRight size={20} /></a>
			</li>
		{/each}
	</ul>
</Screen>

<Sheet open={adding} title="Add store">
	<input class="field" bind:value={newName} placeholder="Store name"
		onkeydown={(e) => e.key === 'Enter' && addStore()} />
	{#snippet foot()}
		<span style="flex:1"></span>
		<button class="btn" onclick={() => (adding = false)}>Cancel</button>
		<button class="btn btn-primary" onclick={addStore}>Add</button>
	{/snippet}
</Sheet>

<Sheet open={editId !== null} title={editing?.name ?? 'Store'}>
	{#if editing}
		<input class="field" bind:value={editName} placeholder="Store name"
			onkeydown={(e) => e.key === 'Enter' && saveStore()} />
	{/if}
	{#snippet foot()}
		<button class="btn btn-danger" onclick={deleteStore}>Delete</button>
		<span style="flex:1"></span>
		<button class="btn" onclick={() => (editId = null)}>Cancel</button>
		<button class="btn btn-primary" onclick={saveStore}>Save</button>
	{/snippet}
</Sheet>

<style>
	.empty { padding: 1.5rem 0.7rem; color: var(--text-2); text-align: center; }
	.group { list-style: none; margin: 0 0.7rem; padding: 0; }
	.store-handle { display: grid; place-items: center; color: var(--text-3); padding: 0.6rem 0.15rem 0.6rem 0; touch-action: none; cursor: grab; }
	.grow { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; text-decoration: none; color: var(--text); min-width: 0; }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ct { flex: none; font-size: var(--fs-sub); color: var(--text-3); font-variant-numeric: tabular-nums; }
	.more { display: grid; place-items: center; width: 2.4rem; height: 2.4rem; background: none; border: 0; color: var(--text-2); }
	.chev { display: grid; place-items: center; color: var(--text-3); }
</style>
```

- [ ] **Step 4: Create `src/routes/(app)/stores/[id]/+page.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ui, currentRows, mutate, keys } from '$lib/client/store.svelte';
	import { buildView } from '$lib/client/view';
	import { resolvePlacement } from '$lib/client/rows';
	import { sortable, type SortableMove } from '$lib/client/sortable';
	import Screen from '$lib/nav/Screen.svelte';
	import Sheet from '$lib/nav/Sheet.svelte';
	import ItemRow from '$lib/client/ItemRow.svelte';
	import ItemOptionsSheet from '$lib/client/ItemOptionsSheet.svelte';
	import AddItemBox from '$lib/client/AddItemBox.svelte';
	import type { ItemView } from '$lib/client/view';
	import { uuid } from '$lib/client/uuid';
	import { parseAdd, singularizeName } from '$lib/quantity';

	const id = $derived(page.params.id);
	const rows = $derived.by(() => {
		ui.rev;
		return currentRows();
	});
	const store = $derived(rows.places.get(id));
	$effect(() => {
		if (ui.booted && !store) goto('/stores', { replaceState: true });
	});
	const view = $derived(buildView(rows, id));

	const suggestions = $derived(
		[...rows.items.values()]
			.filter((i) => !i.deleted_at)
			.map((i) => ({ name: i.name, on_list: !!rows.listState.get(i.id)?.on_list }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	let optionsFor = $state<ItemView | null>(null);
	let editing = $state(false);
	let editName = $state('');
	$effect(() => { if (store) editName = store.name; });

	function addItem(raw: string) {
		const { qty, name: parsed } = parseAdd(raw);
		const n = (qty != null ? singularizeName(parsed) : parsed).trim();
		if (!n) return;
		mutate({
			type: 'add_item',
			item_id: uuid(),
			name: n,
			position: keys.before(view.items[0]?.position ?? null),
			scope_place_id: id,
			qty: qty ?? 1
		});
	}
	function onItemMove(m: SortableMove) {
		const pos = (x: string | undefined) => (x ? resolvePlacement(rows, x, id).position : null);
		mutate({
			type: 'move_item',
			item_id: m.itemId,
			scope_place_id: id,
			position: keys.between(pos(m.toOrder[m.newIndex - 1]), pos(m.toOrder[m.newIndex + 1]))
		});
	}
	function saveStore() {
		if (store && editName.trim() && editName.trim() !== store.name)
			mutate({ type: 'rename_place', place_id: id, name: editName.trim() });
		editing = false;
	}
	function deleteStore() {
		if (store && confirm(`Delete “${store.name}”? Items stay on the list.`)) {
			mutate({ type: 'delete_place', place_id: id });
			goto('/stores', { replaceState: true });
		}
	}
</script>

<svelte:head><title>{store?.name ?? 'Store'}</title></svelte:head>

<Screen title={store?.name ?? 'Store'} back="/stores">
	{#snippet actions()}
		<button class="btn btn-plain" onclick={() => (editing = true)}>Edit</button>
	{/snippet}

	<ul class="list" data-zone={id}
		use:sortable={{ group: 'items', zone: id, handle: '.item-handle', onMove: onItemMove }}>
		{#each view.items as it (it.id)}
			<ItemRow item={it} place={id} scopeName={store?.name ?? ''} onOptions={(x) => (optionsFor = x)} />
		{/each}
	</ul>

	{#if view.hidden.length}
		<section class="extra">
			<h2 class="caption">Not carried here ({view.hidden.length})</h2>
			<ul>{#each view.hidden as it (it.id)}<ItemRow item={it} place={id} scopeName={store?.name ?? ''} onOptions={(x) => (optionsFor = x)} />{/each}</ul>
		</section>
	{/if}
	{#if view.checked.length}
		<section class="extra">
			<h2 class="caption">Checked ({view.checked.length})<span class="grow"></span>
				<button class="btn btn-plain" onclick={() => mutate({ type: 'clear_checked' })}>Clear</button></h2>
			<ul>{#each view.checked as it (it.id)}<ItemRow item={it} place={id} scopeName={store?.name ?? ''} onOptions={(x) => (optionsFor = x)} />{/each}</ul>
		</section>
	{/if}

	<ItemOptionsSheet item={optionsFor} place={id} scopeName={store?.name ?? ''} onClose={() => (optionsFor = null)} />
</Screen>

<Sheet open={editing} title={store?.name ?? 'Store'}>
	<input class="field" bind:value={editName} onkeydown={(e) => e.key === 'Enter' && saveStore()} />
	{#snippet foot()}
		<button class="btn btn-danger" onclick={deleteStore}>Delete</button>
		<span style="flex:1"></span>
		<button class="btn" onclick={() => (editing = false)}>Cancel</button>
		<button class="btn btn-primary" onclick={saveStore}>Save</button>
	{/snippet}
</Sheet>

<footer class="quickadd">
	<AddItemBox {suggestions} boxed dropUp placeholder={`Add to ${store?.name ?? 'store'}…`} onAdd={addItem} />
</footer>

<style>
	.list, .extra ul { list-style: none; margin: 0; padding: 0; }
	.extra h2 { display: flex; align-items: center; margin: 0; padding: 0.7rem 0.7rem 0.3rem; }
	.extra .grow { flex: 1; }
	.quickadd {
		position: fixed;
		left: 0; right: 0;
		bottom: calc(var(--tabbar-h) + var(--safe-b) + var(--kb, 0px));
		z-index: 15;
		padding: 0.5rem 0.7rem;
		background: var(--surface-1);
		border-top: 1px solid var(--line);
	}
</style>
```

- [ ] **Step 5: vite.config.ts comment**

Add a comment beside `navigateFallbackDenylist` in `vite.config.ts`:
`// NOTE: /stores and /stores/[id] are in the (app) SPA group — do NOT denylist them.`

- [ ] **Step 6: Verify**

Run: `npx playwright test` → all pass (the four rewritten store tests now green).
`npm run check` → 0 errors. `npm run test:unit -- --run` → all pass.

- [ ] **Step 7: Manual on dev** — Stores tab lists stores with counts; Add sheet works (no `prompt()`); drag reorders; tapping a store opens its focus screen; quick-add there is scoped; Edit sheet renames/deletes; deleting the open store bounces to `/stores`.

- [ ] **Step 8: Commit**

```bash
git add "src/routes/(app)/stores" e2e/list.e2e.ts vite.config.ts
git commit -m "feat: Stores tab + per-store focus screen; retires the pill switcher and prompt()"
```

---

## Task 7: Recipes list + detail on the Screen frame

**Files:**
- Modify: `src/routes/(recipes)/recipes/+page.svelte`
- Modify: `src/routes/(recipes)/recipes/[id]/+page.svelte`
- Test: `e2e/list.e2e.ts` (recipe nav; no functional recipe e2e exists — add a minimal one)

**Interfaces:**
- Consumes: `Screen`, `Sheet`. `(recipes)` group is SSR — `Screen`'s scroll `$effect` runs after hydration, fine.
- Produces: nothing new.

- [ ] **Step 1: Recipes list — `recipes/+page.svelte`**

- `<script>`: `import Screen from '$lib/nav/Screen.svelte';`
- Replace `<div class="rec-topbar">…</div>` with:

```svelte
<Screen title="Recipes">
	{#snippet actions()}
		<a class="btn btn-sm" href="/recipes/import">Import</a>
		<a class="btn btn-sm btn-primary" href="/recipes/new">New</a>
	{/snippet}
	<!-- existing recipe list markup -->
</Screen>
```

- Move the recipe-list `<ul>`/`<div>` inside `Screen`; close with `</Screen>`.
- Restyle list rows: wrap in `.group`, each link a `.row`.

- [ ] **Step 2: Recipe detail — `recipes/[id]/+page.svelte`**

- `<script>`: `import Screen from '$lib/nav/Screen.svelte'; import Sheet from '$lib/nav/Sheet.svelte';` Add `let menuOpen = $state(false);` and `let deleting = $state(false);`
- Replace the `<div class="rec-topbar noprint">…</div>` (down to its closing `</div>`, including the inline delete `<form>`) with:

```svelte
<Screen title={tree.title}>
	{#snippet actions()}
		<button class="btn btn-sm btn-primary" onclick={() => (picking = true)} disabled={!data.candidates.length}>Add to list</button>
		<button class="btn btn-sm" aria-label="More" onclick={() => (menuOpen = true)}><MoreHorizontal size={18} /></button>
	{/snippet}
```

  (import `MoreHorizontal from '@lucide/svelte/icons/more-horizontal'`.)

- Change `picking` / `haveOpen` from inline toggled blocks to `Sheet`s. The candidate checklist `<form method="POST" action="?/addToList">` moves inside `<Sheet open={picking} title="Add to list">…{#snippet foot()}<button class="btn" type="button" onclick={() => (picking=false)}>Cancel</button><button class="btn btn-primary" type="submit">Add {count}</button>{/snippet}</Sheet>` (the submit button must stay inside the `<form>` — put the whole `<form>` as the Sheet's `children`, and the `foot` snippet buttons also inside the form by placing `<form>` around the `<Sheet>` content is not possible; instead keep the submit button in `children` at the end of the list, and use `foot` only for Cancel).
- "Scale to what I have": `<Sheet open={haveOpen} title="Scale to what I have">` containing the ingredient `<select class="field">` + amount `<input class="field">` + an Apply button calling `applyHave()`.
- The `?/delete` form: `<Sheet open={deleting} title={"Delete " + tree.title + "?"}>` with a `foot` of Cancel + a `<form method="POST" action="?/delete"><button class="btn btn-danger" type="submit">Delete</button></form>`.
- The ⋯ menu `<Sheet open={menuOpen}>`: three rows — `<a class="btn" href={/recipes/${tree.id}/edit}>Edit</a>`, `<button class="btn" onclick={() => { menuOpen=false; window.print(); }}>Print</button>`, `<button class="btn btn-danger" onclick={() => { menuOpen=false; deleting=true; }}>Delete</button>`.
- Keep the scale preset button row (`PRESETS`) inline directly under `<Screen>`'s large title. Keep `<RecipeBody recipe={tree} {scale} />`. Close `</Screen>`.
- Every `Sheet` and the `.scalebar` must be within `noprint` context — `Screen`'s header is already `.noprint`; add `class="noprint"` where needed. `RecipeBody` print rules unchanged.

- [ ] **Step 3: Minimal recipe e2e**

Add to `e2e/list.e2e.ts`:

```ts
test('recipes: create, view, add to list from the sheet', async ({ page }) => {
	await page.click('nav.tabbar a:has-text("Recipes")');
	await page.click('.screen-head a:has-text("New")');
	await page.fill('input.rec-input, input.field', 'Test Salad');
	await page.locator('textarea').first().fill('2 cups spinach\n1 tbsp oil');
	await page.locator('textarea').nth(1).fill('Toss the spinach with the oil.');
	await page.click('button[type=submit]:has-text("Save"), .rec-btn:has-text("Save")');
	await expect(page.locator('h1.screen-title')).toHaveText('Test Salad');

	await page.click('.screen-head button:has-text("Add to list")');
	await expect(page.locator('.sheet-panel')).toBeVisible();
	await page.click('.sheet-panel button:has-text("Add")');
	await page.click('nav.tabbar a:has-text("List")');
	await expect(page.locator('li[data-name="spinach"]')).toBeVisible();
});
```

- [ ] **Step 4: Verify**

`npm run check` → 0 errors. `npm run test:unit -- --run` → pass. `npx playwright test` → pass.

- [ ] **Step 5: Manual on dev** — `/recipes` has Import/New in the header; a recipe opens with its title as the large title; Add-to-list, scale-to-what-I-have, ⋯ (Edit/Print/Delete), and delete-confirm are all sheets; Ctrl+P prints with no chrome and embeds expanded.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(recipes)/recipes/+page.svelte" "src/routes/(recipes)/recipes/[id]/+page.svelte" e2e/list.e2e.ts
git commit -m "feat: Recipes list + detail on Screen frame; secondary actions become sheets"
```

---

## Task 8: Recipe sub-flows chromeless + editor restyle

**Files:**
- Modify: `src/routes/(recipes)/recipes/new/+page.svelte`
- Modify: `src/routes/(recipes)/recipes/import/+page.svelte`
- Modify: `src/routes/(recipes)/recipes/[id]/edit/+page.svelte`
- Modify: `src/routes/(recipes)/RecipeEditor.svelte`
- Modify: `src/routes/(recipes)/+layout.svelte` (drop the last `.rec-topbar` globals)

**Interfaces:**
- Consumes: `Screen` with `back`.
- Produces: nothing new. These routes are already in the root layout's `chromeless` set (Task 2).

- [ ] **Step 1: new / import / edit pages**

For each, replace `<div class="rec-topbar">…</div>` with `<Screen title="New recipe" back="/recipes">` (import: `title="Import a recipe" back="/recipes"`; edit: `title="Edit recipe" back={/recipes/${data.id}}`), move the page body inside, close `</Screen>`. Import `Screen`.

- [ ] **Step 2: RecipeEditor restyle**

In `src/routes/(recipes)/RecipeEditor.svelte`:
- Every `class="rec-input"` → `class="field"`; every `class="rec-textarea"` / `class="rec-textarea big"` → `class="field"` / `class="field big"` (keep the `.big` local rule for min-height/monospace).
- Every `class="rec-btn"` → `class="btn btn-sm"`; `class="rec-btn primary"` → `class="btn btn-sm btn-primary"`.
- Keep the sticky `.actions` bar; retune its CSS: `background: var(--surface-1); border-top: 1px solid var(--line);`. `bottom: 0` stays (chromeless — no tab bar).
- `.mk-btn`, `.subdrop`, `.tag`, `.warn`, `.tidybox` rules: swap raw colours for tokens (`--surface-2`, `--line`, `--danger`, `--accent`).

- [ ] **Step 3: Drop the last `.rec-topbar` globals**

In `src/routes/(recipes)/+layout.svelte` `<style>`, delete the three `:global(.rec-topbar*)` / `:global(.rec-link)` rules re-added in Task 1 Step 3 (nothing references them now). Keep `.wrap`.

- [ ] **Step 4: Verify**

`npm run check` → 0 errors. `npm run test:unit -- --run` → pass. `npx playwright test` → pass (the recipe e2e from Task 7 still green; its `input.field` / `Save` selectors now hit the restyled editor).

- [ ] **Step 5: Manual on dev** — `/recipes/new`, `/recipes/import`, `/recipes/<id>/edit` show no tab bar, a `‹` back header, restyled fields; Save works; Tidy works.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(recipes)/recipes/new/+page.svelte" "src/routes/(recipes)/recipes/import/+page.svelte" "src/routes/(recipes)/recipes/[id]/edit/+page.svelte" "src/routes/(recipes)/RecipeEditor.svelte" "src/routes/(recipes)/+layout.svelte"
git commit -m "feat: recipe create/edit/import as chromeless sub-flows; editor restyle"
```

---

## Task 9: Login, statusbar, InstallHint restyle

**Files:**
- Modify: `src/routes/login/+page.svelte`
- Modify: `src/routes/(app)/+layout.svelte` (`.statusbar` rule)
- Modify: `src/lib/client/InstallHint.svelte`

**Interfaces:** none new.

- [ ] **Step 1: Login**

In `src/routes/login/+page.svelte`: inputs → `class="field"`, the submit button → `class="btn btn-primary"`, wrap the form in a `.login-card` (`background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 1.2rem; max-width: 22rem; margin: 4rem auto;`). Error text → `color: var(--danger)`. Delete raw-colour rules.

- [ ] **Step 2: statusbar**

In `src/routes/(app)/+layout.svelte` `<style>` `.statusbar`: `background: var(--accent); color: #fff; border-radius: var(--r-full);` and `.statusbar.offline { background: var(--text-3); }`. Change `top` to `calc(env(safe-area-inset-top, 0px) + var(--header-h) + 0.4rem)` so it clears the sticky Screen header.

- [ ] **Step 3: InstallHint**

Swap raw colours in `src/lib/client/InstallHint.svelte` `<style>` for tokens (`--surface-2`, `--line`, `--accent`); its dismiss button → `class="btn btn-sm"`.

- [ ] **Step 4: Verify**

`npm run check` → 0 errors. `npm run test:unit -- --run` → pass. `npx playwright test -g "login"` → pass.

- [ ] **Step 5: Manual on dev** — log out (clear cookies), reload → styled login; log in; offline pill styled and clear of the header.

- [ ] **Step 6: Commit**

```bash
git add src/routes/login/+page.svelte "src/routes/(app)/+layout.svelte" src/lib/client/InstallHint.svelte
git commit -m "design: restyle login, sync pill, and install hint to tokens"
```

---

## Task 10: Remove back-compat aliases + final sweep

**Files:**
- Modify: `src/lib/styles/app.css` (delete the alias block)
- Modify: any file still using `.rec-*` / `.link` / `.chip` (should be none in `(recipes)`; `.link` may remain in `(app)` pages — convert)

- [ ] **Step 1: Grep for stragglers**

Run: `git grep -n "rec-btn\|rec-input\|rec-textarea\|class=\"link\|class=\"chip"`
For each hit: `.rec-btn`→`.btn`/`.btn btn-sm`, `.rec-input`/`.rec-textarea`→`.field`, `class="link"`→`class="btn-plain"`, `.chip`→(should only have been on the list header, already deleted).

- [ ] **Step 2: Delete the alias block**

In `src/lib/styles/app.css` delete everything under `/* ===== back-compat aliases (removed in Task 10) ===== */` down to (but not including) `:global(.drag-ghost)`.

- [ ] **Step 3: Verify**

Run: `git grep -n "rec-btn\|rec-input\|rec-textarea"` → no hits.
`npm run check` → 0 errors. `npm run test:unit -- --run` → pass. `npx playwright test` → all pass.
`npm run build` → `✔ done`.

- [ ] **Step 4: Full manual pass on dev**

`MSYS_NO_PATHCONV=1 bash run-list-dev.sh`. Walk every screen from the tab bar in both `prefers-color-scheme` settings: List, a store focus, Items, Recipes, a recipe, the editor, login. Check: no unstyled buttons/inputs, no invisible borders, sheets dismiss three ways, quick-add clears the keyboard, print a recipe.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "design: drop back-compat style aliases; unify on .btn / .field"
```

---

## Task 11: Documentation

**Files:**
- Create: `docs/design.md`
- Modify: `README.md`
- Modify: `../CLAUDE.md` (the "Grocery list — custom app" section)

- [ ] **Step 1: Write `docs/design.md`**

A one-page reference: the token table (from the spec), the primitives (`.btn` variants, `.field`, `.group`/`.row`, `.caption`), the three shell components and their props, the sheet/large-title patterns, and the rule "borders not shadows; one shadow token for sheets". Note dark-first + `prefers-color-scheme`, system fonts, no theme toggle.

- [ ] **Step 2: README**

Update the intro + "Stack" + a new "Navigation" bullet: bottom tabs List/Stores/Items/Recipes; stores managed on the Stores tab; per-store focus at `/stores/[id]`. Remove any mention of the pill switcher.

- [ ] **Step 3: CLAUDE.md**

In `../CLAUDE.md`, "Grocery list — custom app" section:
- Replace the pill / "Edit store" / `prompt()` description with: bottom-tab nav; `/stores` (list, add via sheet, drag-reorder) + `/stores/[id]` (focused drag-ordered list, scoped quick-add); List screen is always the grouped All view.
- Add a "Design language" bullet: `src/lib/styles/app.css` tokens (dark-first), `src/lib/nav/{BottomTabBar,Screen,Sheet}.svelte`, `docs/design.md`. `ItemOptionsSheet` shared by List + `/stores/[id]`.
- Note recipe create/edit/import render chromeless (no tab bar).
- Update the UX bullet (item options is now a sheet, not an inline expand).

- [ ] **Step 4: Commit**

```bash
git add docs/design.md README.md ../CLAUDE.md
git commit -m "docs: design language reference; nav + stores model"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Design tokens (colour/radius/type/motion/layout) | 1 |
| Global stylesheet / primitives | 1 (+ 10 removes aliases) |
| `BottomTabBar` + root layout + clearance + theme-color | 2 |
| `Screen` primitive | 3 |
| `Sheet` primitive | 4 |
| List screen (drop header/chips, Screen, group→/stores link, quick-add offset, options sheet) | 5 |
| `ItemRow` strip + `ItemOptionsSheet` | 5 |
| Stores tab `/stores` | 6 |
| Store focus `/stores/[id]` | 6 |
| Items screen (Screen + row sheet) | 3 + 4 |
| Recipes list (Screen + Import/New) | 7 |
| Recipe detail (Screen, add-to-list/scale/delete/⋯ sheets) | 7 |
| Recipe new/edit/import chromeless (Screen back) | 8 |
| RecipeEditor `.field` restyle | 8 |
| Login restyle | 9 |
| statusbar / InstallHint | 9 |
| Service worker note (no denylist change) | 6 |
| e2e rewrites | folded into 2, 3, 4, 5, 6, 7 |
| Docs (design.md, README, CLAUDE.md) | 11 |

No gaps.

**Placeholder scan:** No "TBD"/"TODO". Every code step has real code or a precise, itemised edit list against a named existing block. The page-rewrite tasks (5, 7, 8) give the new markup for changed regions and an explicit list of deletions rather than re-printing 300-line files verbatim — acceptable because the executor has both the current file and the spec.

**Type consistency:**
- `ItemOptionsSheet` props `{ item: ItemView | null, place: string, scopeName: string, onClose: () => void }` — used identically in Task 5 (List) and Task 6 (`/stores/[id]`).
- `ItemRow` prop `onOptions: (item: ItemView) => void` — defined Task 5 Step 2, consumed Task 5 Step 3 and Task 6 Step 4.
- `Screen` props `{ title: string, back?: string, actions?: Snippet, children: Snippet }` — consistent across Tasks 3, 5, 6, 7, 8.
- `Sheet` props `{ open?: boolean (bindable), title?: string, children: Snippet, foot?: Snippet }` — consistent across Tasks 4, 5, 6, 7.
- `buildView(rows, scope)` `.groups` / `.items` / `.places` / `.hidden` / `.checked` — matches the current `view.ts` shape (verified against `src/lib/client/view.ts`).
- `keys.after` / `keys.before` / `keys.between` and op shapes (`add_place`, `move_place`, `rename_place`, `delete_place`, `add_item`, `move_item`, `set_item_scope`, …) — all exist in `src/lib/types.ts` and `store.svelte.ts` (verified).

No inconsistencies found.
