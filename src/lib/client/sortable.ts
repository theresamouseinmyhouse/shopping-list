import Sortable from 'sortablejs';

export interface SortableMove {
	itemId: string;
	fromZone: string;
	toZone: string;
	/** ids in the target zone in the order Sortable dropped them */
	toOrder: string[];
	newIndex: number;
}

interface Opts {
	group: string;
	/** stable id for this drop zone (e.g. a section id, or '__sections__') */
	zone: string;
	handle?: string;
	disabled?: boolean;
	onMove: (m: SortableMove) => void;
}

/**
 * Svelte action: drag-sortable direct children (touch-friendly, pointer-events based).
 * Children MUST carry `data-id`. On drop we revert Sortable's DOM mutation so Svelte
 * stays the single source of truth, then call `onMove` with the intent.
 *
 * IMPORTANT: the params object is re-created on every render, so `update` must NOT
 * tear down the Sortable instance for a mere reference change — only when `group`,
 * `handle` or `disabled` actually change. The latest `onMove` is read via a ref.
 */
export function sortable(node: HTMLElement, opts: Opts) {
	let current = opts;
	let instance: Sortable | null = null;

	function build() {
		instance = Sortable.create(node, {
			group: current.group,
			handle: current.handle,
			disabled: current.disabled ?? false,
			animation: 150,
			forceFallback: true, // pointer-events dragging — works on touch and is testable
			delay: 0, // dragging always starts from an explicit handle
			fallbackOnBody: true,
			fallbackTolerance: 3,
			emptyInsertThreshold: 24, // easier to drop into an empty section
			ghostClass: 'drag-ghost',
			onEnd(evt: Sortable.SortableEvent) {
				const item = evt.item as HTMLElement;
				const from = evt.from;
				const to = evt.to;
				const oldIndex = evt.oldIndex ?? 0;
				const newIndex = evt.newIndex ?? 0;
				if (from === to && oldIndex === newIndex) return;

				const toOrder = Array.from(to.children).map(
					(c) => (c as HTMLElement).dataset.id ?? ''
				);

				try {
					item.parentNode?.removeChild(item);
					from.insertBefore(item, from.children[oldIndex] ?? null);
				} catch {
					/* Svelte already reconciled */
				}

				current.onMove({
					itemId: item.dataset.id ?? '',
					fromZone: (from as HTMLElement).dataset.zone ?? current.zone,
					toZone: (to as HTMLElement).dataset.zone ?? current.zone,
					toOrder,
					newIndex
				});
			}
		});
	}

	build();

	return {
		update(next: Opts) {
			const structural =
				next.group !== current.group ||
				next.handle !== current.handle ||
				(next.disabled ?? false) !== (current.disabled ?? false);
			current = next; // always refresh onMove / zone refs
			if (structural) {
				instance?.destroy();
				build();
			}
		},
		destroy() {
			instance?.destroy();
			instance = null;
		}
	};
}
