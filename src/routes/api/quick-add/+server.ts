import { json, error } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { generateKeyBetween } from 'fractional-indexing';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { instance } from '$lib/server/instance';
import { applyOps, changesSince } from '$lib/server/sync';
import { publish } from '$lib/server/events';
import { GLOBAL } from '$lib/types';
import { parseAdd, singularizeName } from '$lib/quantity';

/**
 * Minimal "add one item" endpoint for external callers (Home Assistant voice, etc.).
 * Auth: `Authorization: Bearer <LIST_API_TOKEN>` OR a logged-in session cookie.
 * Body: { "name": "milk", "place"?: "<place id>" }  ("place" optional; default = every list)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const configured = env.LIST_API_TOKEN?.trim();
	const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	const tokenOk =
		!!configured &&
		bearer.length === configured.length &&
		timingSafeEqual(Buffer.from(bearer), Buffer.from(configured));

	if (!tokenOk && !locals.authed) throw error(401, 'unauthorized');

	let name = '';
	let place = GLOBAL;
	try {
		const body = await request.json();
		name = String(body?.name ?? '').trim();
		if (typeof body?.place === 'string') place = body.place;
	} catch {
		throw error(400, 'bad json');
	}
	if (!name) throw error(400, 'name required');

	const { qty, name: parsed } = parseAdd(name);
	const finalName = qty != null ? singularizeName(parsed) : parsed;

	const { db } = await instance();
	const lastPos = (
		db.prepare(`SELECT MAX(position) AS p FROM placements WHERE scope_place_id = ''`).get() as {
			p: string | null;
		}
	).p;

	applyOps(db, [
		{
			id: crypto.randomUUID(),
			ts: Date.now(),
			type: 'add_item',
			item_id: crypto.randomUUID(),
			name: finalName,
			position: generateKeyBetween(lastPos ?? null, null),
			scope_place_id: place,
			qty: qty ?? 1
		}
	]);
	publish(changesSince(db, 0).cursor);
	return json({ ok: true, name: finalName, qty: qty ?? 1 });
};
