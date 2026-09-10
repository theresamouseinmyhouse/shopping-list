# list

A location-aware smart shopping list. One shared list; "places" (stores — grocery
*and* non-grocery) are filtered views over it. Each place is one flat, drag-ordered
list — set it to match your walk through that store. The **All** view groups every
item under its home store (drag a row between groups to re-home it) plus a "Not
sorted yet" group. Every item remembers its position and hidden flag **per place**,
inheriting from a no-place default. Offline-capable PWA with sync. Two-person
household, one shared password.

## Stack

SvelteKit (`adapter-node`) full-stack · `better-sqlite3` · Dexie outbox + `/api/sync`
· SSE live-sync (`/api/events`) · SortableJS drag-drop · `@node-rs/argon2` auth.

## Develop

```sh
npm install                 # needs legacy-peer-deps (in .npmrc)
npm run dev
npm test                    # vitest + playwright
npm run test:unit
npm run build && node scripts/serve.mjs   # run the production build locally on :4173
```

`LIST_PASSWORD` / `LIST_SECRET` / `LIST_DB_PATH` env vars; see `list.env.example`.
Leave `LIST_PASSWORD` unset and the first visit shows a one-time "create a
password" screen.

## Self-host

Needs Docker. No config file required — you set the password from the browser on
first visit. For the installable PWA and offline sync you also need HTTPS (below).

### Plain HTTP (a LAN, or behind a proxy you already run)

```sh
git clone https://github.com/theresamouseinmyhouse/shopping-list.git
cd shopping-list
docker compose up -d           # pulls the prebuilt image -> http://localhost:2120
```

One container, no compose:

```sh
docker run -d --name listapp --restart unless-stopped \
  -p 2120:3000 -v list-data:/data \
  ghcr.io/theresamouseinmyhouse/shopping-list:latest
```

Open the app and pick a shared password on the first screen.

### HTTPS with an automatic certificate (Caddy)

```sh
cd shopping-list
echo "DOMAIN=list.example.com" > .env      # a real hostname pointing at this host
docker compose -f docker-compose.yml -f compose.https.yml up -d
```

Caddy gets a Let's Encrypt cert for `$DOMAIN` and proxies it to the app (SSE
included). Ports 80 and 443 must be reachable from the internet. Already run your
own proxy instead? Point it at `:2120`, forward `X-Forwarded-Proto`, and disable
response buffering on `/api/events` (nginx `proxy_buffering off;`).

### Configuration — all optional (`list.env`)

| var | default | purpose |
|--|--|--|
| `LIST_PASSWORD` | unset → set it on first visit | pre-seed the shared password; edit + restart to change it |
| `LIST_SECRET` | generated, stored in the DB | session-cookie signing key; set it only to pin it into your backups |
| `LIST_API_TOKEN` | unset → session required | bearer token for `POST /api/quick-add` (voice assistants, scripts) |
| `LIST_GEMINI_API_KEY` | unset → AI import off | Gemini key for **Recipes → Import** from a photo, or a link with no structured data |
| `LIST_GEMINI_MODEL` | `gemini-2.5-flash` | model used for AI import |

`cp list.env.example list.env`, uncomment what you need; compose reads it
automatically.

### Data, backup, updates

SQLite lives at `/data` — the `./data` folder (compose) or the `list-data`
volume. Back it up. To update: `docker compose pull && docker compose up -d`, or
`git pull && docker compose up -d --build` if you build from source.

## Model

- `items` — catalog of everything ever added (survives check-off).
- `list_state` — which items are on the active list + checked status.
- `places` — stores / lists. The "All" view is the empty scope `''`.
- `list_state.scope_place_id` — an item's **home store** (`''` = not sorted into a
  store yet). Added while a store is selected → that store is its home and it shows
  only there; added from "All" → home-less, shows everywhere. The All view groups by
  this; dragging a row into another group re-homes it.
- `placements` — per-`(item, scope)` `position` (fractional index — the item's spot
  in that store's one flat, drag-ordered list) + `hidden` ("on the master list but
  not carried at this store"). Scope `''` is the default every place inherits.
- Every row carries `rev` (global monotonic counter); `/api/sync` returns rows with
  `rev > cursor`. Conflict policy: last-write-wins by `rev`.
- `recipes` / `recipe_steps` / `recipe_ingredients` / `recipe_links` /
  `recipe_step_ingredients` / `item_aliases` — a small **method-first** recipe keeper
  at `/recipes` (server-rendered, online-only, **not** synced). One canonical
  ingredient list; steps are prose and link to ingredients whose names they mention.
  Printable view, sub-recipes embedded inline. Import parses locally first (schema.org
  JSON-LD, microdata, then a plain-text heuristic); AI (`LIST_GEMINI_API_KEY`) is an
  explicit fallback and only needed for photos or messy pages. "Add to list" pushes a
  recipe (and its sub-recipes) onto the shopping list.

## v1.1 ideas

Staples view (`items.is_staple` already exists) · near-duplicate-name de-dupe.
