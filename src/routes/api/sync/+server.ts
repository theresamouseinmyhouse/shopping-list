import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { instance } from '$lib/server/instance';
import { applyOps, changesSince } from '$lib/server/sync';
import { publish } from '$lib/server/events';
import type { Op, SyncRequest } from '$lib/types';

const MAX_OPS = 500;

export const POST: RequestHandler = async ({ request }) => {
	const { db } = await instance();

	let body: SyncRequest;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'bad json');
	}
	const since = Number.isFinite(body?.since) ? Math.max(0, Math.floor(body.since)) : 0;
	const ops: Op[] = Array.isArray(body?.ops) ? body.ops.slice(0, MAX_OPS) : [];

	if (ops.length) {
		applyOps(db, ops);
	}

	const cs = changesSince(db, since);
	if (ops.length) publish(cs.cursor);
	return json(cs);
};

// Pull-only (used on first load / reconnect when there's nothing to push).
export const GET: RequestHandler = async ({ url }) => {
	const { db } = await instance();
	const since = Number(url.searchParams.get('since') ?? '0') || 0;
	return json(changesSince(db, Math.max(0, Math.floor(since))));
};
