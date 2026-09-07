# list

A location-aware smart shopping list. One shared list; "places" (stores — grocery
*and* non-grocery) are filtered views over it. Each item remembers its section,
position and hidden flag **per place**, inheriting from a no-place default. Offline-
capable PWA with sync. Two-person household, one shared password.

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

You need Docker and (for the installable PWA + offline sync) HTTPS in front of it.

```sh
git clone https://github.com/theresamouseinmyhouse/shopping-list.git
cd shopping-list
cp list.env.example list.env          # set LIST_SECRET; LIST_PASSWORD is optional
docker compose up -d --build          # -> http://localhost:2120
```

Or without compose: `./run-list.sh` (same thing), or by hand:

```sh
docker build -t list:local .
docker run -d --name listapp --restart unless-stopped \
  -p 2120:3000 --env-file list.env -v "$PWD/data:/data" list:local
```

- **`list.env`** — `LIST_SECRET` (required; 64+ random chars, signs the session
  cookie). `LIST_PASSWORD` optional: leave it unset and the first visit lets you
  pick the password; set it to pre-seed or rotate. `LIST_API_TOKEN` optional, for
  `POST /api/quick-add`.
- **Data** — SQLite lives on the `./data` bind mount (`/data` in the container).
  Back that folder up.
- **Reverse proxy** — put nginx / Caddy / Traefik in front for TLS. Turn response
  buffering off on `/api/events` (it's an SSE stream) — e.g. nginx
  `proxy_buffering off;`, Caddy `flush_interval -1`. The session cookie is marked
  `Secure` only when the proxy sends `X-Forwarded-Proto: https`, so plain-HTTP
  access must be on `localhost` or a LAN IP (where the browser tolerates it, but
  the service worker / install prompt won't run).

## Model

- `items` — catalog of everything ever added (survives check-off).
- `list_state` — which items are on the active list + checked status.
- `places` — stores / lists. The "All" view is the empty scope `''`.
- `sections` — aisles. Global (`place_id=''`) or place-specific.
- `section_order` — per-scope ordering/visibility of sections.
- `placements` — per-`(item, scope)` section + position + hidden. Scope `''` is the
  default that places inherit.
- Every row carries `rev` (global monotonic counter); `/api/sync` returns rows with
  `rev > cursor`. Conflict policy: last-write-wins by `rev`.

## v1.1 ideas

Staples view (`items.is_staple` already exists) · near-duplicate-name de-dupe.
