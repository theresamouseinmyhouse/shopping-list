// Household settings: the shared password and the Gemini (AI) configuration.
// Both live in the `meta` table, same as everything else session/config-shaped.
// Edited from /settings; see auth.ts for the first-run password seed and
// instance.ts for ensureAiConfigSeeded's first-boot call.

import { getMeta, setMeta, type DB } from './db';
import { checkPassword, hashPassword } from './auth';

export const DEFAULT_AI_MODEL = 'gemini-2.5-flash';

export interface AiConfig {
	enabled: boolean;
	apiKey: string;
	model: string;
	/** freeform instructions appended to every AI call (import, tidy, generate) */
	extraInstructions: string;
}

export function getAiConfig(db: DB): AiConfig {
	return {
		enabled: getMeta(db, 'ai_enabled') === '1',
		apiKey: getMeta(db, 'ai_api_key') ?? '',
		model: getMeta(db, 'ai_model') || DEFAULT_AI_MODEL,
		extraInstructions: getMeta(db, 'ai_extra_instructions') ?? ''
	};
}

export function setAiConfig(
	db: DB,
	patch: Partial<{ enabled: boolean; apiKey: string; model: string; extraInstructions: string }>
): void {
	if (patch.enabled !== undefined) setMeta(db, 'ai_enabled', patch.enabled ? '1' : '0');
	if (patch.apiKey !== undefined) setMeta(db, 'ai_api_key', patch.apiKey.trim());
	if (patch.model !== undefined) setMeta(db, 'ai_model', patch.model.trim() || DEFAULT_AI_MODEL);
	if (patch.extraInstructions !== undefined)
		setMeta(db, 'ai_extra_instructions', patch.extraInstructions.trim());
}

/**
 * First-run only: seed the AI config from list.env's LIST_GEMINI_API_KEY /
 * LIST_GEMINI_MODEL. `ai_api_key` is used as the "ever initialized" sentinel —
 * `getMeta` returns null only when the row has never been written, including by
 * a deliberate "clear the key" save (which writes ''). Once initialized, env is
 * never consulted again — the Settings page owns it from then on.
 */
export function ensureAiConfigSeeded(
	db: DB,
	envKey: string | undefined,
	envModel: string | undefined
): void {
	if (getMeta(db, 'ai_api_key') !== null) return;
	const key = envKey?.trim() ?? '';
	setAiConfig(db, {
		apiKey: key,
		model: envModel?.trim() || DEFAULT_AI_MODEL,
		enabled: !!key,
		extraInstructions: ''
	});
}

/** Requires the current password so a guest on an already-logged-in device can't silently take it over. */
export async function changePassword(
	db: DB,
	currentPw: string,
	newPw: string
): Promise<'ok' | 'wrong-current'> {
	if (!(await checkPassword(db, currentPw))) return 'wrong-current';
	setMeta(db, 'password_hash', await hashPassword(newPw));
	return 'ok';
}
