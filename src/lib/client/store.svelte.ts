import { generateKeyBetween } from 'fractional-indexing';
import { uuid } from './uuid';
import { idb } from './idb';
import { emptyRows, cloneRows, applyOpToRows, plKey, type Rows } from './rows';
import { type ChangeSet, type Op, type OpInput, type PlaceScope } from '$lib/types';

// --- non-reactive core; `ui.rev` is the single reactive signal ------------

let serverRows: Rows = emptyRows();
let outbox: Op[] = [];
let cursor = 0;
let deviceId = '';
let es: EventSource | null = null;
let syncQueued = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
let stopped = false;

function stopEverything() {
	stopped = true;
	es?.close();
	es = null;
	if (interval) clearInterval(interval);
	if (debounceTimer) clearTimeout(debounceTimer);
}

export const ui = $state({
	booted: false,
	online: true,
	syncing: false,
	pending: 0,
	place: '' as PlaceScope,
	rev: 0
});

function bump() {
	ui.rev++;
}

/** server rows + replayed outbox — rebuild whenever `ui.rev` changes. */
export function currentRows(): Rows {
	const r = cloneRows(serverRows);
	for (const op of outbox) applyOpToRows(r, op);
	return r;
}


// --- ops -----------------------------------------------------------------

function op(partial: OpInput): Op {
	return { id: uuid(), ts: Date.now(), ...partial } as Op;
}

export async function mutate(partial: OpInput): Promise<void> {
	const o = op(partial);
	outbox.push(o);
	ui.pending = outbox.length;
	bump();
	await idb.outbox.put({ id: o.id, op: o, created: Date.now() });
	scheduleSync();
}

export const keys = {
	after: (last: string | null) => generateKeyBetween(last, null),
	before: (first: string | null) => generateKeyBetween(null, first),
	/** tolerant of stale / equal / inverted neighbours (can happen after a merge) */
	between(a: string | null, b: string | null): string {
		try {
			if (a && b && a >= b) return generateKeyBetween(a, null);
			return generateKeyBetween(a, b);
		} catch {
			return generateKeyBetween(a ?? null, null);
		}
	}
};

// --- sync --------------------------------------------------------------

function scheduleSync(delay = 400) {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		void sync();
	}, delay);
}

export async function sync(): Promise<void> {
	if (stopped || ui.syncing) {
		if (!stopped) syncQueued = true;
		return;
	}
	ui.syncing = true;
	const sending = outbox.slice();
	try {
		const res = await fetch('/api/sync', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ since: cursor, ops: sending })
		});
		if (res.status === 401) {
			stopEverything();
			if (location.pathname !== '/login') location.href = '/login';
			return;
		}
		if (!res.ok) throw new Error(`sync ${res.status}`);
		const cs: ChangeSet = await res.json();

		if (cs.cursor < cursor) {
			// Server is behind us (DB reset / restored from backup) — drop local mirror and re-pull.
			await hardReset();
			return;
		}

		mergeChanges(cs);
		cursor = cs.cursor;

		const acked = new Set(sending.map((o) => o.id));
		outbox = outbox.filter((o) => !acked.has(o.id));

		await persist(cs, [...acked]);
		ui.online = true;
	} catch {
		ui.online = false;
	} finally {
		ui.syncing = false;
		ui.pending = outbox.length;
		bump();
		if (syncQueued) {
			syncQueued = false;
			scheduleSync(0);
		}
	}
}

function mergeChanges(cs: ChangeSet): void {
	for (const p of cs.places) serverRows.places.set(p.id, p);
	for (const i of cs.items) serverRows.items.set(i.id, i);
	for (const l of cs.list_state) serverRows.listState.set(l.item_id, l);
	for (const pl of cs.placements)
		serverRows.placements.set(plKey(pl.item_id, pl.scope_place_id), pl);
}

async function persist(cs: ChangeSet, ackedOpIds: string[]): Promise<void> {
	await idb.transaction('rw', [idb.places, idb.items, idb.list_state, idb.placements, idb.outbox, idb.kv], async () => {
		if (cs.places.length) await idb.places.bulkPut(cs.places);
		if (cs.items.length) await idb.items.bulkPut(cs.items);
		if (cs.list_state.length) await idb.list_state.bulkPut(cs.list_state);
		if (cs.placements.length) await idb.placements.bulkPut(cs.placements);
		if (ackedOpIds.length) await idb.outbox.bulkDelete(ackedOpIds);
		await idb.kv.put({ key: 'cursor', value: String(cs.cursor) });
	});
}

// --- boot -------------------------------------------------------------

export async function boot(): Promise<void> {
	if (ui.booted) return;

	ui.online = navigator.onLine;
	try {
		ui.place = localStorage.getItem('list.place') ?? '';
	} catch {
		/* private mode */
	}

	const [kvCursor, kvDevice, places, items, ls, pl, ob] = await Promise.all([
		idb.kv.get('cursor'),
		idb.kv.get('deviceId'),
		idb.places.toArray(),
		idb.items.toArray(),
		idb.list_state.toArray(),
		idb.placements.toArray(),
		idb.outbox.orderBy('created').toArray()
	]);

	cursor = kvCursor ? Number(kvCursor.value) : 0;
	deviceId = kvDevice?.value ?? uuid();
	if (!kvDevice) await idb.kv.put({ key: 'deviceId', value: deviceId });

	serverRows = emptyRows();
	for (const p of places) serverRows.places.set(p.id, p);
	for (const i of items) serverRows.items.set(i.id, i);
	for (const l of ls) serverRows.listState.set(l.item_id, l);
	for (const p of pl) serverRows.placements.set(plKey(p.item_id, p.scope_place_id), p);
	outbox = ob.map((x) => x.op);

	ui.pending = outbox.length;
	ui.booted = true;
	bump();

	maybeAutoClearChecked();

	addEventListener('online', () => {
		ui.online = true;
		void sync();
	});
	addEventListener('offline', () => (ui.online = false));
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void sync();
	});
	startSSE();
	interval = setInterval(() => void sync(), 30_000);
	void sync();
}

const STALE_CHECKED_MS = 12 * 60 * 60 * 1000;

/** On open, if every checked item was checked long ago, clear them (leftovers from a past shop). */
function maybeAutoClearChecked(): void {
	const times = [...serverRows.listState.values()]
		.filter((l) => l.on_list && l.checked)
		.map((l) => l.checked_at || 0);
	if (times.length && Date.now() - Math.max(...times) > STALE_CHECKED_MS) {
		void mutate({ type: 'clear_checked' });
	}
}

async function hardReset(): Promise<void> {
	serverRows = emptyRows();
	outbox = [];
	cursor = 0;
	await idb.transaction(
		'rw',
		[idb.places, idb.items, idb.list_state, idb.placements, idb.outbox, idb.kv],
		async () => {
			await Promise.all([
				idb.places.clear(),
				idb.items.clear(),
				idb.list_state.clear(),
				idb.placements.clear(),
				idb.outbox.clear()
			]);
			await idb.kv.put({ key: 'cursor', value: '0' });
		}
	);
	ui.pending = 0;
	bump();
	scheduleSync(0);
}

function startSSE(): void {
	if (stopped) return;
	try {
		es?.close();
		es = new EventSource('/api/events');
		let fails = 0;
		es.onmessage = (e) => {
			fails = 0;
			const c = Number(e.data);
			if (Number.isFinite(c) && c > cursor) void sync();
		};
		es.onerror = () => {
			// EventSource auto-reconnects; if it keeps failing, fall back to polling
			if (++fails >= 3) {
				es?.close();
				es = null;
				void sync();
			}
		};
	} catch {
		/* SSE unsupported / blocked — the 30s interval covers it */
	}
}

export function setPlace(scope: PlaceScope): void {
	ui.place = scope;
	try {
		localStorage.setItem('list.place', scope);
	} catch {
		/* ignore */
	}
}
