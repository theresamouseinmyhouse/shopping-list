import type { Handle } from '@sveltejs/kit';
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

export const handle: Handle = async ({ event, resolve }) => {
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
