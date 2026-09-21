// Minimal Vite config for running one-off scripts/*.ts under vite-node.
// The root vite.config.ts pulls in the SvelteKit plugin, which narrows
// server.fs.allow to just src/lib, src/routes, node_modules, etc — that
// blocks vite-node's SSR module transform from reading files elsewhere in
// the repo (e.g. migrations/*.sql?raw, imported by src/lib/server/migrations.ts).
// Scripts don't use $lib/$app aliases (relative imports only), so they don't
// need the SvelteKit plugin at all — this config just avoids that restriction.
import { defineConfig } from 'vite';

export default defineConfig({});
