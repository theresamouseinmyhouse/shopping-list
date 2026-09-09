-- 0007 — method-first authoring support: ingredient prep notes (`comment`),
-- ingredient/step group labels ("For the sauce"), and a catalog alias table so
-- "granulated sugar" resolves to "sugar". recipe_step_ingredients rows are now
-- derived from step prose at save time (an ingredient name appearing in a step
-- links it) plus any explicit picks — not from a checklist.

ALTER TABLE recipe_ingredients ADD COLUMN comment     TEXT NOT NULL DEFAULT '';  -- prep: "sifted", "diced", "at room temp"
ALTER TABLE recipe_ingredients ADD COLUMN group_label TEXT NOT NULL DEFAULT '';  -- "For the sauce"
ALTER TABLE recipe_steps       ADD COLUMN group_label TEXT NOT NULL DEFAULT '';

CREATE TABLE item_aliases (
  alias_norm TEXT PRIMARY KEY,          -- normalizeName(alias)
  item_id    TEXT NOT NULL REFERENCES items(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX item_aliases_item ON item_aliases(item_id);
