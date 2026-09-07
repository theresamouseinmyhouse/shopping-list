import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'node scripts/e2e-server.mjs',
		port: PORT,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});
