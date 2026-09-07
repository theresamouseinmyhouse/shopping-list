// Server for the Playwright e2e run. Env baked in so the webServer command is
// a single cross-platform invocation. Assumes `npm run build` already ran.
import { rmSync } from 'node:fs';

process.title = 'list-e2e-server';
Object.assign(process.env, {
	LIST_PASSWORD: 'e2e-pass',
	LIST_SECRET: 'e2e-secret',
	LIST_DB_PATH: 'data/e2e.db',
	LIST_TEST_RESET: '1',
	LIST_API_TOKEN: 'e2e-api-token',
	PORT: '4174',
	ORIGIN: 'http://localhost:4174'
});

for (const suffix of ['', '-wal', '-shm']) {
	try {
		rmSync(`data/e2e.db${suffix}`);
	} catch {
		/* not there */
	}
}

await import('../build/index.js');
