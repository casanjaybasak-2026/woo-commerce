-- Shelfmade initial schema
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT,
  short_desc TEXT NOT NULL DEFAULT '',
  long_desc_md TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  compare_at_cents INTEGER CHECK (compare_at_cents IS NULL OR compare_at_cents >= 0),
  cover_key TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_products_published ON products (published, deleted_at);

CREATE TABLE product_files (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products (id),
  r2_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_product_files_product ON product_files (product_id);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  customer_email TEXT,
  customer_id TEXT REFERENCES customers (id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'refunded', 'expired')),
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX idx_orders_status ON orders (status, created_at);
CREATE INDEX idx_orders_pi ON orders (stripe_payment_intent);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id),
  product_id TEXT NOT NULL REFERENCES products (id),
  title_snapshot TEXT NOT NULL,
  price_cents_snapshot INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers (id),
  product_id TEXT NOT NULL REFERENCES products (id),
  order_id TEXT NOT NULL REFERENCES orders (id),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (customer_id, product_id, order_id)
);
CREATE INDEX idx_entitlements_customer ON entitlements (customer_id);

CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX idx_login_tokens_email ON login_tokens (email, created_at);

CREATE TABLE sessions (
  session_hash TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE download_events (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT NOT NULL REFERENCES entitlements (id),
  file_id TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX idx_download_events ON download_events (entitlement_id, file_id, at);

CREATE TABLE stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);
