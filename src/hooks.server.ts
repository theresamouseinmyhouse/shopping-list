import type { Handle, RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { instance } from '$lib/server/instance';
import { SESSION_COOKIE, verifySession } from '$lib/server/auth';

const PUBLIC_PATHS = [
	'/login',
	'/api/login',
	'/api/setup', // first-run password creation; refuses once a password is set
	'/api/quick-add', // enforces its own auth (bearer token or session)
	'/health',
	'/manifest.webmanifest',
	'/sw.js'
];

function isPublic(pathname: string): boolean {
	if (PUBLIC_PATHS.includes(pathname)) return true;
	// PWA + static assets served by Vite/SvelteKit
	return (
		pathname.startsWith('/_app/') ||
		pathname.startsWith('/favicon') ||
		pathname === '/robots.txt' ||
		/\.(png|svg|ico|webp|woff2?|css|js|json|webmanifest)$/.test(pathname)
	);
}

// Our own form-CSRF check, replacing SvelteKit's built-in one (disabled in
// svelte.config.js): adapter-node can't tell http from https without
// `x-forwarded-proto`, so its same-origin guess is wrong on the plain-http path
// and the built-in check 403s every form action. This compares the browser's
// `Origin` to the `Host` we were actually reached on — which matches for direct
// access and for a reverse proxy that forwards the original Host (nginx `$host`,
// Cloudflare Tunnel). `LIST_TRUSTED_ORIGINS` (comma-separated) covers any proxy
// that rewrites Host to something internal.
const EXTRA_ORIGINS = (env.LIST_TRUSTED_ORIGINS ?? '')
	.split(',')
	.map((s) => s.trim().replace(/\/$/, ''))
	.filter(Boolean);

function crossSiteFormPost(event: RequestEvent): boolean {
	if (event.request.method !== 'POST') return false;
	const type = event.request.headers.get('content-type')?.split(';')[0].trim();
	const isForm =
		type === 'application/x-www-form-urlencoded' ||
		type === 'multipart/form-data' ||
		type === 'text/plain';
	if (!isForm) return false;

	const origin = event.request.headers.get('origin');
	if (!origin) return true; // browsers always send Origin on a form POST
	if (EXTRA_ORIGINS.includes(origin)) return false;
	try {
		return new URL(origin).host !== (event.request.headers.get('host') ?? '');
	} catch {
		return true;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	if (crossSiteFormPost(event)) {
		return new Response('Cross-site form POST blocked', { status: 403 });
	}

	const { secret } = await instance();
	const authed = verifySession(secret, event.cookies.get(SESSION_COOKIE));
	event.locals.authed = authed;

	if (!authed && !isPublic(event.url.pathname)) {
		if (event.url.pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		return new Response(null, { status: 303, headers: { location: '/login' } });
	}

	return resolve(event);
};
