import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { Cookies } from '@sveltejs/kit';
import { getMeta, setMeta, type DB } from './db';

export const SESSION_COOKIE = 'list_session';
export const SESSION_MAX_AGE_S = 400 * 24 * 60 * 60; // ~400d (Chrome's cap); keeps offline devices authed

// --- password ---------------------------------------------------------------

export function hashPassword(pw: string): Promise<string> {
	return argonHash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
	if (!hash) return false;
	try {
		return await argonVerify(hash, pw);
	} catch {
		return false;
	}
}

/**
 * On boot: seed the shared password from LIST_PASSWORD, and rotate it if the env
 * value has changed since last boot (so `list.env` + restart is a working way to
 * change the password until there's a settings UI). If LIST_PASSWORD is unset,
 * whatever is already stored stays.
 */
export async function ensurePasswordSeeded(db: DB, envPassword: string | undefined): Promise<void> {
	if (!envPassword) return;
	const stored = getMeta(db, 'password_hash') ?? '';
	if (stored && (await verifyPassword(stored, envPassword))) return; // unchanged
	setMeta(db, 'password_hash', await hashPassword(envPassword));
}

export async function checkPassword(db: DB, pw: string): Promise<boolean> {
	return verifyPassword(getMeta(db, 'password_hash') ?? '', pw);
}

/** True when no password has been set yet — the first-run "create a password" screen. */
export function needsSetup(db: DB): boolean {
	return !(getMeta(db, 'password_hash') ?? '');
}

export const MIN_PASSWORD_LEN = 8;

/**
 * First-run only: set the shared password iff none exists yet. Returns false if a
 * password is already set (so the setup endpoint can't be used to change it).
 */
export async function setInitialPassword(db: DB, pw: string): Promise<boolean> {
	if (getMeta(db, 'password_hash')) return false;
	setMeta(db, 'password_hash', await hashPassword(pw));
	return true;
}

// --- session cookie -------------------------------------------------------------

/** Issue the signed session cookie. Secure only behind an HTTPS-terminating proxy. */
export function issueSession(cookies: Cookies, request: Request, secret: string): void {
	cookies.set(SESSION_COOKIE, signSession(secret), {
		path: '/',
		httpOnly: true,
		secure: request.headers.get('x-forwarded-proto') === 'https',
		sameSite: 'lax',
		maxAge: SESSION_MAX_AGE_S
	});
}

// --- session token (stateless, HMAC-signed) --------------------------------

function b64url(buf: Buffer): string {
	return buf.toString('base64url');
}

export function signSession(secret: string, now = Date.now()): string {
	const data = b64url(Buffer.from(JSON.stringify({ v: 1, iat: now })));
	const sig = b64url(createHmac('sha256', secret).update(data).digest());
	return `${data}.${sig}`;
}

export function verifySession(secret: string, token: string | undefined): boolean {
	if (!token) return false;
	const [data, sig] = token.split('.');
	if (!data || !sig) return false;
	const expected = b64url(createHmac('sha256', secret).update(data).digest());
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
	try {
		const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
		if (payload.v !== 1 || typeof payload.iat !== 'number') return false;
		return Date.now() - payload.iat < SESSION_MAX_AGE_S * 1000;
	} catch {
		return false;
	}
}

export function randomSecret(): string {
	return randomBytes(48).toString('base64url');
}

// --- login rate limiting (in-memory; fine for a two-person app) -------------

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

/** Returns true if this IP is allowed another login attempt right now. */
export function loginRateOk(ip: string): boolean {
	const now = Date.now();
	const b = buckets.get(ip);
	if (!b || now > b.resetAt) {
		buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	b.count += 1;
	return b.count <= MAX_ATTEMPTS;
}

export function loginRateReset(ip: string): void {
	buckets.delete(ip);
}
