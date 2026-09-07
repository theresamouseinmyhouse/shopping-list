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
- `sections` — aisles. Global (`place_id=''`) or place-specific.
- `section_order` — per-scope ordering/visibility of sections.
- `placements` — per-`(item, scope)` section + position + hidden. Scope `''` is the
  default that places inherit.
- Every row carries `rev` (global monotonic counter); `/api/sync` returns rows with
  `rev > cursor`. Conflict policy: last-write-wins by `rev`.

## v1.1 ideas

Staples view (`items.is_staple` already exists) · near-duplicate-name de-dupe.
