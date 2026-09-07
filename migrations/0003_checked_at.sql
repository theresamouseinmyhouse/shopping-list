-- 0003_checked_at — timestamp when an item was last checked, so the app can
-- auto-clear stale checked items (e.g. left over from a shop days ago).

ALTER TABLE list_state ADD COLUMN checked_at INTEGER NOT NULL DEFAULT 0;
