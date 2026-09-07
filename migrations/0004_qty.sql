-- 0004_qty — per-list-entry quantity. "4 milk" / "two onions" bump this instead
-- of creating a junk item; the name is matched (and singularised) against the catalog.

ALTER TABLE list_state ADD COLUMN qty INTEGER NOT NULL DEFAULT 1;
