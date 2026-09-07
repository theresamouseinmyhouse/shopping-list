-- 0002_item_scope — an item added while a place is selected belongs only to that
-- place's list (e.g. "nails" added at Hardware shows only at Hardware). '' = on
-- every place's list (added from the "All" view).

ALTER TABLE list_state ADD COLUMN scope_place_id TEXT NOT NULL DEFAULT '';
