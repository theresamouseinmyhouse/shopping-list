import { describe, it, expect } from 'vitest';
import { openDb } from './db';
import { setInitialPassword } from './auth';
import { getAiConfig, setAiConfig, ensureAiConfigSeeded, changePassword, DEFAULT_AI_MODEL } from './settings';

describe('AI config', () => {
	it('defaults to disabled, no key, the default model', () => {
		const db = openDb(':memory:');
		expect(getAiConfig(db)).toEqual({
			enabled: false,
			apiKey: '',
			model: DEFAULT_AI_MODEL,
			extraInstructions: ''
		});
	});

	it('setAiConfig patches only the given fields', () => {
		const db = openDb(':memory:');
		setAiConfig(db, { enabled: true, apiKey: 'abc123' });
		setAiConfig(db, { extraInstructions: 'always metric' });
		expect(getAiConfig(db)).toEqual({
			enabled: true,
			apiKey: 'abc123',
			model: DEFAULT_AI_MODEL,
			extraInstructions: 'always metric'
		});
	});

	it('ensureAiConfigSeeded seeds from env only on a fresh db', () => {
		const db = openDb(':memory:');
		ensureAiConfigSeeded(db, 'env-key', 'gemini-2.0-flash');
		expect(getAiConfig(db)).toMatchObject({ enabled: true, apiKey: 'env-key', model: 'gemini-2.0-flash' });
	});

	it('ensureAiConfigSeeded does nothing once the config has been initialized', () => {
		const db = openDb(':memory:');
		ensureAiConfigSeeded(db, 'env-key', undefined); // first boot
		setAiConfig(db, { apiKey: 'changed-in-settings', enabled: true }); // user edits it
		ensureAiConfigSeeded(db, 'env-key', undefined); // container recreated, env unchanged
		expect(getAiConfig(db).apiKey).toBe('changed-in-settings'); // env did not stomp it
	});

	it('ensureAiConfigSeeded with no env key seeds a disabled, empty config (still marks it initialized)', () => {
		const db = openDb(':memory:');
		ensureAiConfigSeeded(db, undefined, undefined);
		expect(getAiConfig(db)).toEqual({
			enabled: false,
			apiKey: '',
			model: DEFAULT_AI_MODEL,
			extraInstructions: ''
		});
		// a later env change still doesn't retroactively enable it
		ensureAiConfigSeeded(db, 'late-key', undefined);
		expect(getAiConfig(db).apiKey).toBe('');
	});
});

describe('changePassword', () => {
	it('changes the password when the current one is correct', async () => {
		const db = openDb(':memory:');
		await setInitialPassword(db, 'old-password');
		const result = await changePassword(db, 'old-password', 'new-password-123');
		expect(result).toBe('ok');
	});

	it('refuses when the current password is wrong', async () => {
		const db = openDb(':memory:');
		await setInitialPassword(db, 'old-password');
		const result = await changePassword(db, 'wrong', 'new-password-123');
		expect(result).toBe('wrong-current');
	});
});
