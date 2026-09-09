-- 0005_recipes — a small server-side recipe keeper. These tables are NOT synced
-- (not in CHANGE_TABLES, no `rev`): recipes are reference data edited online at a
-- desk, not part of the offline shopping-list op stream. `recipe_ingredients.item_id`
-- optionally links a line to the shopping catalog so a recipe can be pushed onto the
-- list. `recipe_links` embeds another recipe (gravy inside shepherd's pie).

CREATE TABLE recipes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  title_norm TEXT NOT NULL,               -- normalizeName(title); sub-recipe lookup key
  servings   TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX recipes_title_norm ON recipes(title_norm);

CREATE TABLE recipe_steps (
  id        TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  ord       INTEGER NOT NULL,
  heading   TEXT NOT NULL DEFAULT '',
  body      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX recipe_steps_recipe ON recipe_steps(recipe_id);

CREATE TABLE recipe_ingredients (
  id        TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  ord       INTEGER NOT NULL,
  amount    TEXT NOT NULL DEFAULT '',      -- free text: "1 tsp", "2 cups"
  name      TEXT NOT NULL,                 -- as written; catalog-match key
  item_id   TEXT REFERENCES items(id),     -- nullable link to the shopping catalog
  step_id   TEXT REFERENCES recipe_steps(id) -- nullable; NULL = mise-en-place only
);
CREATE INDEX recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

CREATE TABLE recipe_links (
  id              TEXT PRIMARY KEY,
  recipe_id       TEXT NOT NULL REFERENCES recipes(id),
  child_recipe_id TEXT NOT NULL REFERENCES recipes(id),
  ord             INTEGER NOT NULL,
  step_id         TEXT REFERENCES recipe_steps(id) -- nullable; NULL = "components" block
);
CREATE INDEX recipe_links_recipe ON recipe_links(recipe_id);
