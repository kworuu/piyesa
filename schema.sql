-- schema.sql
-- Target SQLite schema for Piyesa's future catalog.json -> SQLite migration.
-- NOT YET WIRED IN: server.js / cartEngine.js currently read catalog.json directly.
-- Recommended migration path: use `better-sqlite3` (synchronous API), and swap
-- cartEngine.js's loadCatalog() to query `products`/`substitutes` instead.

CREATE TABLE IF NOT EXISTS products (
  sku           TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  pack_size     INTEGER NOT NULL DEFAULT 1,
  pack_price    REAL NOT NULL,
  stock         INTEGER NOT NULL DEFAULT 0,
  image_url     TEXT
);

-- Self-referencing junction table for compatible/substitute products.
CREATE TABLE IF NOT EXISTS substitutes (
  product_sku     TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  substitute_sku  TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  PRIMARY KEY (product_sku, substitute_sku)
);

CREATE TABLE IF NOT EXISTS templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  image_url     TEXT,
  estimated_cost REAL
);

CREATE TABLE IF NOT EXISTS template_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id   TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  item_name     TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1
);

-- Planned (not required for MVP demo) — for once login/auth exists:
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_carts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cart_json     TEXT NOT NULL,
  total         REAL NOT NULL,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);
