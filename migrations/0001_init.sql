-- 0001_init — initial schema for "list".
-- Every mutable table carries `rev` (global monotonic counter, see meta.rev) and a
-- soft-delete `deleted_at` (epoch ms, NULL = live). `rev` drives incremental sync:
-- /api/sync returns every row with rev > client-cursor.
-- The global/"no place" scope is the empty string '' (NOT NULL) throughout, because
-- SQLite composite PRIMARY KEYs do not treat NULLs as equal and upserts would break.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO meta (key, value) VALUES ('schema_version', '1'), ('rev', '0'), ('password_hash', '');

CREATE TABLE places (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  position   TEXT NOT NULL,
  rev        INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX places_rev ON places(rev);

CREATE TABLE sections (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  place_id   TEXT NOT NULL DEFAULT '',   -- '' = global section (shown in every place + no-place view)
  rev        INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX sections_rev ON sections(rev);

CREATE TABLE section_order (
  scope_place_id TEXT NOT NULL DEFAULT '',  -- '' = global/default order; seeds every place
  section_id     TEXT NOT NULL,
  position       TEXT NOT NULL,
  hidden         INTEGER NOT NULL DEFAULT 0,
  rev            INTEGER NOT NULL,
  PRIMARY KEY (scope_place_id, section_id)
);
CREATE INDEX section_order_rev ON section_order(rev);

CREATE TABLE items (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_norm  TEXT NOT NULL,               -- normalizeName(name); catalog dedupe / upsert key
  note       TEXT NOT NULL DEFAULT '',
  is_staple  INTEGER NOT NULL DEFAULT 0,
  rev        INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX items_rev ON items(rev);
CREATE INDEX items_name_norm ON items(name_norm);

CREATE TABLE list_state (
  item_id  TEXT PRIMARY KEY,
  on_list  INTEGER NOT NULL DEFAULT 0,
  checked  INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL DEFAULT 0,
  rev      INTEGER NOT NULL
);
CREATE INDEX list_state_rev ON list_state(rev);

CREATE TABLE placements (
  item_id        TEXT NOT NULL,
  scope_place_id TEXT NOT NULL DEFAULT '',  -- '' = default placement (no-place view + inheritance seed)
  section_id     TEXT NOT NULL DEFAULT '',  -- '' = no section
  position       TEXT NOT NULL,
  hidden         INTEGER NOT NULL DEFAULT 0,
  rev            INTEGER NOT NULL,
  PRIMARY KEY (item_id, scope_place_id)
);
CREATE INDEX placements_rev ON placements(rev);

CREATE TABLE ops_applied (
  op_id      TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
