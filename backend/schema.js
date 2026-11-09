// Creates any missing tables and columns on startup. It only adds; it never drops tables or deletes data.
const { pool } = require("./database");

const SCHEMA_LOCK_NAMESPACE = 24680;
const SCHEMA_LOCK_KEY = 13579;
let schemaInitialization;

async function runDatabaseSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'buyer',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buyers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT buyers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sellers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      store_name VARCHAR(150),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT sellers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      seller_id INTEGER NOT NULL,
      category_id INTEGER,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      price NUMERIC(10,2) NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      brand VARCHAR(150),
      CONSTRAINT products_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS carts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id SERIAL PRIMARY KEY,
      cart_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
      CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id SERIAL PRIMARY KEY,
      buyer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT wishlist_items_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT wishlist_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT wishlist_unique UNIQUE (buyer_id, product_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      total_amount NUMERIC(10,2) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      seller_id INTEGER,
      quantity INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      subtotal NUMERIC(10,2),
      CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      payment_method VARCHAR(80) NOT NULL,
      payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      amount NUMERIC(10,2) NOT NULL,
      transaction_reference VARCHAR(150),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS mrp_price NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS offer_text TEXT,
      ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(60),
      ADD COLUMN IF NOT EXISTS return_policy TEXT,
      ADD COLUMN IF NOT EXISTS return_window_days INTEGER,
      ADD COLUMN IF NOT EXISTS reserved_stock INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE;

    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_address JSONB,
      ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS inventory_committed BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS mrp_price NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT,
      ADD COLUMN IF NOT EXISTS product_image_snapshot TEXT,
      ADD COLUMN IF NOT EXISTS cart_item_id INTEGER;

    CREATE TABLE IF NOT EXISTS delivery_addresses (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_name VARCHAR(120) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      address_line1 VARCHAR(240) NOT NULL,
      address_line2 VARCHAR(240),
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      postal_code VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id BIGSERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      image_data BYTEA NOT NULL,
      content_type VARCHAR(40) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_reviews (
      id BIGSERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_item_id INTEGER NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE RESTRICT,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      review_text TEXT NOT NULL,
      moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
      moderated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      moderated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id BIGSERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      quantity_change INTEGER NOT NULL,
      reason VARCHAR(40) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id BIGSERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status VARCHAR(40) NOT NULL,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT order_status_history_unique UNIQUE (order_id, status)
    );

    CREATE INDEX IF NOT EXISTS idx_products_available ON products(is_available);
    CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, id);
    CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON product_reviews(product_id, moderation_status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reviews_buyer ON product_reviews(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_addresses_user ON delivery_addresses(user_id, id);
    CREATE INDEX IF NOT EXISTS idx_inventory_product_date ON inventory_movements(product_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_orders_reservation_expiry ON orders(reservation_expires_at)
      WHERE stock_reserved = TRUE;
    CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id, created_at);
  `);
  await pool.query(`
    WITH released AS (
      UPDATE orders SET stock_reserved = FALSE, reservation_expires_at = NULL, status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE stock_reserved = TRUE
      RETURNING id
    ), returned_stock AS (
      UPDATE products p SET reserved_stock = GREATEST(p.reserved_stock - i.quantity, 0)
      FROM (
        SELECT product_id, SUM(quantity)::int AS quantity FROM order_items
        WHERE order_id IN (SELECT id FROM released) GROUP BY product_id
      ) i
      WHERE p.id = i.product_id
    )
    UPDATE payments SET payment_status = 'cancelled'
    WHERE order_id IN (SELECT id FROM released) AND payment_status <> 'captured';
    UPDATE orders SET status = 'confirmed' WHERE status = 'order_placed';
    INSERT INTO order_status_history (order_id, status, changed_by, created_at)
    SELECT o.id, 'confirmed', o.user_id, o.created_at
    FROM orders o
    WHERE o.status IN ('confirmed', 'processing', 'on_the_way', 'received', 'completed')
    ON CONFLICT (order_id, status) DO NOTHING;
    INSERT INTO order_status_history (order_id, status, created_at)
    SELECT o.id, 'on_the_way', o.updated_at
    FROM orders o WHERE o.status IN ('on_the_way', 'received', 'completed')
    ON CONFLICT (order_id, status) DO NOTHING;
    INSERT INTO order_status_history (order_id, status, created_at)
    SELECT o.id, 'received', o.updated_at
    FROM orders o WHERE o.status IN ('received', 'completed')
    ON CONFLICT (order_id, status) DO NOTHING;
    INSERT INTO order_status_history (order_id, status, created_at)
    SELECT o.id, 'completed', o.updated_at
    FROM orders o WHERE o.status = 'completed'
    ON CONFLICT (order_id, status) DO NOTHING;
  `);
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'products'::regclass
            AND conname = 'products_seller_id_fkey'
            AND confrelid = 'sellers'::regclass
        ) THEN
          ALTER TABLE products
          DROP CONSTRAINT IF EXISTS products_seller_id_fkey;

          ALTER TABLE products
          ADD CONSTRAINT products_seller_id_fkey
          FOREIGN KEY (seller_id)
          REFERENCES sellers(id)
          ON DELETE CASCADE;
        END IF;
      END
      $$;
    `);
  } catch (error) {
    console.error(
      "Products seller FK migration warning:",
      error.message
    );
  }
  const addColumns = [
    "ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
    "ALTER TABLE IF EXISTS order_items ADD COLUMN IF NOT EXISTS seller_id INTEGER;",
    "ALTER TABLE IF EXISTS order_items ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);",
    "ALTER TABLE IF EXISTS carts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
    "ALTER TABLE IF EXISTS cart_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
    "ALTER TABLE IF EXISTS cart_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
    "ALTER TABLE IF EXISTS wishlist_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
    "ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(150);",
    "ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;"
  ];

  for (const sql of addColumns) {
    try {
      await pool.query(sql);
    } catch (error) {
      console.error("Schema migration warning:", error.message);
    }
  }

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);
    CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
    CREATE INDEX IF NOT EXISTS idx_wishlist_buyer ON wishlist_items(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
  `);
}

async function ensureDatabaseSchema() {
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    await lockClient.query("SELECT pg_advisory_lock($1, $2)", [
      SCHEMA_LOCK_NAMESPACE,
      SCHEMA_LOCK_KEY
    ]);
    lockAcquired = true;
    await runDatabaseSchema();
  } finally {
    try {
      if (lockAcquired) {
        await lockClient.query("SELECT pg_advisory_unlock($1, $2)", [
          SCHEMA_LOCK_NAMESPACE,
          SCHEMA_LOCK_KEY
        ]);
      }
    } finally {
      lockClient.release();
    }
  }
}

function getSchemaReady() {
  if (!schemaInitialization) {
    schemaInitialization = ensureDatabaseSchema().catch((error) => {
      schemaInitialization = undefined;
      throw error;
    });
  }
  return schemaInitialization;
}

module.exports = { getSchemaReady };
