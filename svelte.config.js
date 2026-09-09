import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// adapter-node can't tell http from https without x-forwarded-proto, so its
		// same-origin guess is wrong on the plain-http path and SvelteKit's built-in
		// form-CSRF check 403s every form action. hooks.server.ts does its own
		// Host-based origin check instead (works for direct access + a Host-
		// forwarding proxy; LIST_TRUSTED_ORIGINS covers anything else).
		csrf: { checkOrigin: false }
	}
};

export default config;
