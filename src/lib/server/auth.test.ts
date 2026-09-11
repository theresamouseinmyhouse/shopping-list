import { describe, it, expect } from 'vitest';
import { openDb } from './db';
import {
	hashPassword,
	verifyPassword,
	signSession,
	verifySession,
	SESSION_MAX_AGE_S,
	loginRateOk,
	needsSetup,
	setInitialPassword,
	checkPassword,
	ensurePasswordSeeded
} from './auth';

describe('password hashing', () => {
	it('verifies a correct password and rejects a wrong one', async () => {
		const h = await hashPassword('correct horse battery staple');
		expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
		expect(await verifyPassword(h, 'Tr0ub4dor&3')).toBe(false);
	});
	it('rejects against an empty stored hash', async () => {
		expect(await verifyPassword('', 'anything')).toBe(false);
	});
});

describe('session token', () => {
	const secret = 'test-secret-abc';
	it('round-trips', () => {
		expect(verifySession(secret, signSession(secret))).toBe(true);
	});
	it('rejects a tampered token', () => {
		const t = signSession(secret);
		expect(verifySession(secret, t.slice(0, -2) + 'xx')).toBe(false);
	});
	it('rejects a token signed with a different secret', () => {
		expect(verifySession('other', signSession(secret))).toBe(false);
	});
	it('rejects an expired token', () => {
		const old = Date.now() - (SESSION_MAX_AGE_S * 1000 + 60_000);
		expect(verifySession(secret, signSession(secret, old))).toBe(false);
	});
	it('rejects undefined / garbage', () => {
		expect(verifySession(secret, undefined)).toBe(false);
		expect(verifySession(secret, 'not.a.token')).toBe(false);
	});
});

describe('first-run setup', () => {
	it('needsSetup is true on a fresh db, false once a password is set', async () => {
		const db = openDb(':memory:');
		expect(needsSetup(db)).toBe(true);
		expect(await setInitialPassword(db, 'first-password')).toBe(true);
		expect(needsSetup(db)).toBe(false);
		expect(await checkPassword(db, 'first-password')).toBe(true);
	});

	it('setInitialPassword refuses to overwrite an existing password', async () => {
		const db = openDb(':memory:');
		await setInitialPassword(db, 'original-password');
		expect(await setInitialPassword(db, 'attacker-password')).toBe(false);
		expect(await checkPassword(db, 'original-password')).toBe(true);
		expect(await checkPassword(db, 'attacker-password')).toBe(false);
	});
});

describe('ensurePasswordSeeded', () => {
	it('seeds LIST_PASSWORD into a fresh db', async () => {
		const db = openDb(':memory:');
		await ensurePasswordSeeded(db, 'env-password');
		expect(await checkPassword(db, 'env-password')).toBe(true);
	});

	it('does nothing on a fresh db when no env password is given (first-run screen stays up)', async () => {
		const db = openDb(':memory:');
		await ensurePasswordSeeded(db, undefined);
		expect(needsSetup(db)).toBe(true);
	});

	it('never overwrites a password that already exists, even if the env value differs', async () => {
		const db = openDb(':memory:');
		await setInitialPassword(db, 'chosen-in-app');
		await ensurePasswordSeeded(db, 'different-env-password');
		expect(await checkPassword(db, 'chosen-in-app')).toBe(true);
		expect(await checkPassword(db, 'different-env-password')).toBe(false);
	});
});

describe('login rate limit', () => {
	it('allows a burst then blocks', () => {
		const ip = `1.2.3.${Math.random()}`;
		let allowed = 0;
		for (let i = 0; i < 20; i++) if (loginRateOk(ip)) allowed++;
		expect(allowed).toBe(10);
	});
});
