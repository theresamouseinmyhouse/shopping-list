// In-process pub/sub for SSE live-sync. Single container, so a module-level Set is enough.
// On any mutation the /api/sync handler calls publish(cursor); every open /api/events
// stream pushes it and clients then do a normal incremental /api/sync.

type Subscriber = (cursor: number) => void;

const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
	subscribers.add(fn);
	return () => subscribers.delete(fn);
}

export function publish(cursor: number): void {
	for (const fn of subscribers) {
		try {
			fn(cursor);
		} catch {
			/* a dead stream; its cleanup will remove it */
		}
	}
}
