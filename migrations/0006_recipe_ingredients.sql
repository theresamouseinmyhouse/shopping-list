-- 0006 — one canonical ingredient list per recipe, structured amounts, and a
-- many-to-many link between steps and ingredients (an ingredient can be used in
-- several steps). Replaces recipe_ingredients.step_id.

ALTER TABLE recipe_ingredients ADD COLUMN quantity   TEXT NOT NULL DEFAULT '';
ALTER TABLE recipe_ingredients ADD COLUMN unit       TEXT NOT NULL DEFAULT '';  -- canonical (see src/lib/units.ts)
ALTER TABLE recipe_ingredients ADD COLUMN quantity2  TEXT NOT NULL DEFAULT '';  -- alternate measure, e.g. volume when qty is weight
ALTER TABLE recipe_ingredients ADD COLUMN unit2      TEXT NOT NULL DEFAULT '';
ALTER TABLE recipe_ingredients ADD COLUMN prefer_alt INTEGER NOT NULL DEFAULT 0; -- 1 = show/use the *2 measure first

CREATE TABLE recipe_step_ingredients (
  step_id       TEXT NOT NULL REFERENCES recipe_steps(id),
  ingredient_id TEXT NOT NULL REFERENCES recipe_ingredients(id),
  ord           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (step_id, ingredient_id)
);
CREATE INDEX recipe_step_ingredients_step ON recipe_step_ingredients(step_id);

-- carry any existing single-step assignments over to the join table
INSERT INTO recipe_step_ingredients (step_id, ingredient_id, ord)
  SELECT step_id, id, ord FROM recipe_ingredients WHERE step_id IS NOT NULL AND step_id != '';

-- recipe_ingredients.step_id is now vestigial: SQLite can't DROP a column that
-- carries a FOREIGN KEY, so it stays but the app no longer reads or writes it.
