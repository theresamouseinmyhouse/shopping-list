// Local test runner for the built app. Distinct filename so it's easy to find/kill.
// Usage: LIST_PASSWORD=... LIST_SECRET=... LIST_DB_PATH=... node scripts/serve.mjs
process.title = 'list-dev-server';
process.env.PORT ??= '4173';
process.env.ORIGIN ??= `http://localhost:${process.env.PORT}`;
await import('../build/index.js');
