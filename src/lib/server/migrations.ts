// Migrations are bundled as raw strings (Vite `?raw`) so they ship inside the
// adapter-node build with no filesystem lookup. Add new files in order.
import m0001 from '../../../migrations/0001_init.sql?raw';
import m0002 from '../../../migrations/0002_item_scope.sql?raw';
import m0003 from '../../../migrations/0003_checked_at.sql?raw';
import m0004 from '../../../migrations/0004_qty.sql?raw';

export interface Migration {
	name: string;
	sql: string;
}

export const MIGRATIONS: Migration[] = [
	{ name: '0001_init', sql: m0001 },
	{ name: '0002_item_scope', sql: m0002 },
	{ name: '0003_checked_at', sql: m0003 },
	{ name: '0004_qty', sql: m0004 }
];
