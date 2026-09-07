import type { RequestHandler } from './$types';
import { instance } from '$lib/server/instance';
import { subscribe } from '$lib/server/events';
import { currentRev } from '$lib/server/db';

/** SSE stream. Emits `data: <cursor>` on every mutation, plus periodic `: ping` keep-alives. */
export const GET: RequestHandler = async () => {
	const { db } = await instance();

	let unsubscribe = () => {};
	let ping: ReturnType<typeof setInterval>;

	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			const send = (line: string) => {
				try {
					controller.enqueue(enc.encode(line));
				} catch {
					cleanup();
				}
			};
			// initial cursor so a just-connected client can catch up immediately
			send(`retry: 3000\ndata: ${currentRev(db)}\n\n`);
			unsubscribe = subscribe((cursor) => send(`data: ${cursor}\n\n`));
			ping = setInterval(() => send(`: ping\n\n`), 25000);
		},
		cancel() {
			cleanup();
		}
	});

	function cleanup() {
		unsubscribe();
		clearInterval(ping);
	}

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
