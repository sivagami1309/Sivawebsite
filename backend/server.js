require('dotenv').config();


const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 8080;
const databaseUrl = process.env.USE_LOCAL_PG === "true" ? null : process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: databaseUrl || undefined,
  host: databaseUrl ? undefined : (process.env.PGHOST || "localhost"),
  port: databaseUrl ? undefined : Number(process.env.PGPORT || 5432),
  database: databaseUrl ? undefined : (process.env.PGDATABASE || "siva_mart"),
  user: databaseUrl ? undefined : process.env.PGUSER,
  password: databaseUrl ? undefined : process.env.PGPASSWORD,
  ssl: databaseUrl ? { rejectUnauthorized: false } : false
});

const SCHEMA_LOCK_NAMESPACE = 24680;
const SCHEMA_LOCK_KEY = 13579;
let schemaInitialization;
const authTokenSecret = process.env.AUTH_TOKEN_SECRET || crypto.randomBytes(32).toString("hex");

if (process.env.AUTH_TOKEN_SECRET && Buffer.byteLength(process.env.AUTH_TOKEN_SECRET) < 32) {
  throw new Error("AUTH_TOKEN_SECRET must contain at least 32 bytes.");
}

if (!process.env.AUTH_TOKEN_SECRET) {
  console.warn("AUTH_TOKEN_SECRET is unset; active sessions will be invalidated when the server restarts.");
}

if (process.env.NODE_ENV === "production" && !process.env.AUTH_TOKEN_SECRET) {
  throw new Error("AUTH_TOKEN_SECRET is required in production.");
}

const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { files: 8, fileSize: 512 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      return callback(new Error("Only JPEG, PNG, WebP, or GIF images are allowed."));
    }
    return callback(null, true);
  }
});

function createAuthToken(user) {
  const payload = Buffer.from(JSON.stringify({
    sub: String(user.id),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", authTokenSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readAuthToken(request) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = crypto.createHmac("sha256", authTokenSecret).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!/^[1-9]\d*$/.test(claims.sub) || !Number.isSafeInteger(claims.exp) || claims.exp <= Date.now() / 1000) {
      return null;
    }
    return Number(claims.sub);
  } catch {
    return null;
  }
}

const PAYMENT_METHOD_COD = "Cash on Delivery";
const ORDER_STATUS_FLOW = ["confirmed", "processing", "on_the_way", "received", "completed"];
const ORDER_STATUS_TRANSITIONS = {
  confirmed: ["on_the_way", "processing"],
  processing: ["on_the_way"],
  on_the_way: ["received"],
  received: ["completed"]
};

async function runDatabaseSchema() {
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

async function getUserProfile(userId) {
  const result = await pool.query(
    `SELECT users.id, users.full_name, users.email, users.role, sellers.store_name
     FROM users LEFT JOIN sellers ON sellers.user_id = users.id
     WHERE users.id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function ensureRoleProfile(userId, fullName, email, role, storeName = "") {
  if (role === "buyer") {
    await pool.query(
      `INSERT INTO buyers (user_id, full_name, email)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM buyers WHERE user_id = $1)`,
      [userId, fullName, email]
    );
  }

  if (role === "seller") {
    await pool.query(
      `INSERT INTO sellers (user_id, full_name, email, store_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         store_name = EXCLUDED.store_name`,
      [userId, fullName, email, storeName]
    );
  }
}

async function requireUser(request, response, requiredRole) {
  const userId = readAuthToken(request);

  if (!userId) {
    response.status(401).json({ message: "Authentication required." });
    return null;
  }

  const user = await getUserProfile(userId);
  if (!user) {
    response.status(401).json({ message: "User not found." });
    return null;
  }

  if (requiredRole && user.role !== requiredRole) {
    response.status(403).json({ message: "Unauthorized." });
    return null;
  }

  return { user };
}

async function optionalUser(request) {
  const userId = readAuthToken(request);
  return userId ? getUserProfile(userId) : null;
}

async function requireAdmin(request, response) {
  const auth = await requireUser(request, response, "admin");
  if (!auth) return null;
  return auth.user;
}

async function ensureBuyerCart(userId) {
  const cartResult = await pool.query(
    "SELECT id FROM carts WHERE user_id = $1 LIMIT 1",
    [userId]
  );

  if (cartResult.rows[0]) {
    return cartResult.rows[0].id;
  }

  const newCart = await pool.query(
    "INSERT INTO carts (user_id) VALUES ($1) RETURNING id",
    [userId]
  );

  return newCart.rows[0].id;
}

async function getCartSummary(userId) {
  const cartId = await ensureBuyerCart(userId);

  const items = await pool.query(`
    SELECT ci.id, ci.product_id, ci.quantity, p.price,
           p.name AS product_name, p.description, p.image_url, p.mrp_price,
           p.is_available AND p.stock > p.reserved_stock AS in_stock,
           c.name AS category_name,
           p.seller_id
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ci.cart_id = $1
    ORDER BY ci.created_at DESC
  `, [cartId]);

  const subtotal = items.rows.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);

  return {
    cart_id: cartId,
    items: items.rows,
    item_count: items.rows.reduce((sum, item) => sum + Number(item.quantity), 0),
    subtotal: Number(subtotal.toFixed(2))
  };
}

async function getCategoryId(name) {
  if (!name) return null;
  const cleaned = String(name).trim();
  if (!cleaned) return null;

  const existing = await pool.query(
    "SELECT id FROM categories WHERE LOWER(name) = LOWER($1) LIMIT 1",
    [cleaned]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const created = await pool.query(
    "INSERT INTO categories (name) VALUES ($1) RETURNING id",
    [cleaned]
  );

  return created.rows[0].id;
}

async function releaseOrderReservation(orderId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query(
      "SELECT id, stock_reserved, inventory_committed FROM orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order || !order.stock_reserved || order.inventory_committed) {
      await client.query("COMMIT");
      return false;
    }

    const items = await client.query(
      "SELECT product_id, SUM(quantity)::int AS quantity FROM order_items WHERE order_id = $1 GROUP BY product_id",
      [orderId]
    );
    for (const item of items.rows) {
      await client.query(
        "UPDATE products SET reserved_stock = GREATEST(reserved_stock - $1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [item.quantity, item.product_id]
      );
    }
    await client.query(
      "UPDATE orders SET stock_reserved = FALSE, reservation_expires_at = NULL, status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [orderId]
    );
    await client.query(
      "UPDATE payments SET payment_status = 'cancelled' WHERE order_id = $1 AND payment_status <> 'captured'",
      [orderId]
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function releaseExpiredReservations() {
  const expired = await pool.query(
    "SELECT id FROM orders WHERE stock_reserved = TRUE AND reservation_expires_at <= CURRENT_TIMESTAMP ORDER BY reservation_expires_at LIMIT 50"
  );
  for (const order of expired.rows) {
    await releaseOrderReservation(order.id);
  }
}

app.use(cors());
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use("/api", async (request, response, next) => {
  if (request.path === "/health") {
    return next();
  }

  try {
    await getSchemaReady();
    return next();
  } catch (error) {
    console.error("Database schema initialization failed:", error.message);
    return response.status(503).json({
      message: "The database is temporarily unavailable."
    });
  }
});

app.post("/api/register", async (request, response) => {
  try {
    const { email, password, role } = request.body;
    const fullName = request.body.full_name ?? request.body.fullName;
    const storeName = String(request.body.store_name ?? request.body.storeName ?? "").trim();

    const cleanedName = String(fullName || "").trim();
    const cleanedEmail = String(email || "").trim().toLowerCase();
    const cleanedPassword = String(password || "");
    const cleanedRole = String(role || "buyer").trim().toLowerCase();

    if (!cleanedName || !cleanedEmail || !cleanedPassword) {
      return response.status(400).json({
        message: "Full name, email and password are required."
      });
    }

    if (!["buyer", "seller"].includes(cleanedRole)) {
      return response.status(400).json({
        message: "Invalid account type."
      });
    }

    if (cleanedRole === "seller" && !storeName) {
      return response.status(400).json({
        message: "Store name is required for seller accounts."
      });
    }

    if (cleanedPassword.length < 6) {
      return response.status(400).json({
        message: "Password must contain at least 6 characters."
      });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [cleanedEmail]
    );

    if (existingUser.rows.length > 0) {
      return response.status(409).json({
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(cleanedPassword, 10);

    const userResult = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role`,
      [cleanedName, cleanedEmail, passwordHash, cleanedRole]
    );

    const user = userResult.rows[0];

    await ensureRoleProfile(
      user.id,
      user.full_name,
      user.email,
      user.role,
      storeName
    );

    if (user.role === "buyer") {
      await ensureBuyerCart(user.id);
    }

    return response.status(201).json({
      message: "Account created successfully.",
      user
    });
  } catch (error) {
    console.error("Registration error:", error);

    return response.status(500).json({
      message: "Unable to create account right now."
    });
  }
});
app.post("/api/login", async (request, response) => {
  try {
    const { email, password, role } = request.body || {};
    const cleanedEmail = String(email || "").trim().toLowerCase();
    const cleanedPassword = String(password || "");
    const cleanedRole = String(role || "").trim().toLowerCase();

    if (!cleanedEmail || !cleanedPassword || !["buyer", "seller", "admin"].includes(cleanedRole)) {
      return response.status(400).json({ message: "Enter a valid email, password, and account type." });
    }

    const result = await pool.query(
      `SELECT users.id, users.full_name, users.email, users.role,
              sellers.store_name,
              COALESCE(to_jsonb(users)->>'password_hash', to_jsonb(users)->>'password') AS password_hash
       FROM users
       LEFT JOIN sellers ON sellers.user_id = users.id
       WHERE LOWER(users.email) = $1
       LIMIT 1`,
      [cleanedEmail]
    );
    const user = result.rows[0];

    if (
      !user ||
      user.role !== cleanedRole ||
      !user.password_hash ||
      !(await bcrypt.compare(cleanedPassword, user.password_hash))
    ) {
      return response.status(401).json({ message: "Incorrect email, password, or account type." });
    }

    const safeUser = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      store_name: user.store_name || ""
    };
    return response.json({ message: "Login successful.", user: safeUser, token: createAuthToken(safeUser) });
  } catch (error) {
    console.error("Login error:", error);
    return response.status(500).json({ message: "Unable to sign in right now." });
  }
});
app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    response.status(503).json({ status: "error", database: "disconnected" });
  }
});
app.get("/api/categories", async (_request, response) => {
  try {
    const result = await pool.query(
      "SELECT id, name FROM categories ORDER BY name"
    );
    return response.json(result.rows);
  } catch (error) {
    console.error("Category fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load categories." });
  }
});

app.get("/api/admin/stats", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;

  try {
    const [totalUsers, buyers, sellers, products, orders, value, revenue, orderStatuses] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM users"),
      pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'buyer'"),
      pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'seller'"),
      pool.query("SELECT COUNT(*)::int AS total FROM products"),
      pool.query("SELECT COUNT(*)::int AS total FROM orders"),
      pool.query("SELECT COALESCE(SUM(total_amount), 0)::numeric AS total FROM orders WHERE total_amount IS NOT NULL"),
      pool.query("SELECT COALESCE(SUM(total_amount), 0)::numeric AS total FROM orders WHERE status IN ('confirmed', 'processing', 'on_the_way', 'received', 'completed')"),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'confirmed')::int AS new_orders,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE status = 'on_the_way')::int AS on_the_way,
          COUNT(*) FILTER (WHERE status = 'on_the_way')::int AS awaiting_confirmation,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
        FROM orders
      `)
    ]);
    const stageCounts = orderStatuses.rows[0] || {};

    return response.json({
      totals: {
        users: Number(totalUsers.rows[0]?.total || 0),
        buyers: Number(buyers.rows[0]?.total || 0),
        sellers: Number(sellers.rows[0]?.total || 0),
        products: Number(products.rows[0]?.total || 0),
        orders: Number(orders.rows[0]?.total || 0),
        orderValue: Number(value.rows[0]?.total || 0),
        revenue: Number(revenue.rows[0]?.total || 0),
        newOrders: Number(stageCounts.new_orders || 0),
        ordersProcessing: Number(stageCounts.processing || 0),
        ordersOnTheWay: Number(stageCounts.on_the_way || 0),
        awaitingConfirmation: Number(stageCounts.awaiting_confirmation || 0),
        completedOrders: Number(stageCounts.completed || 0),
        cancelledOrders: Number(stageCounts.cancelled || 0)
      }
    });
  } catch (error) {
    console.error("Admin stats failed:", error.message);
    return response.status(500).json({ message: "Unable to load dashboard statistics." });
  }
});

app.get("/api/admin/users", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;

  try {
    const search = String(request.query.search || "").trim();
    const role = String(request.query.role || "all").trim().toLowerCase();
    const values = [];
    const conditions = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(
        LOWER(full_name) LIKE LOWER($${values.length})
        OR LOWER(email) LIKE LOWER($${values.length})
      )`);
    }

    if (role && role !== "all") {
      values.push(role);
      conditions.push(`LOWER(role) = LOWER($${values.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT id, full_name, email, role, created_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC NULLS LAST, id ASC
      `,
      values
    );

    return response.json(result.rows);
  } catch (error) {
    console.error("Admin user fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load users." });
  }
});

app.get("/api/admin/products", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;

  try {
    const search = String(request.query.search || "").trim();
    const category = String(request.query.category || "").trim();
    const values = [];
    const conditions = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(
        LOWER(p.name) LIKE LOWER($${values.length})
        OR LOWER(COALESCE(p.description, '')) LIKE LOWER($${values.length})
      )`);
    }

    if (category && category.toLowerCase() !== "all") {
      values.push(category);
      conditions.push(`(
        c.id::text = $${values.length}
        OR LOWER(COALESCE(c.name, '')) = LOWER($${values.length})
      )`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT p.id, p.name, p.description, p.price, COALESCE(p.mrp_price, p.price) AS mrp_price,
             p.seller_id, COALESCE(NULLIF(p.image_url, ''), (
               SELECT '/api/products/' || image.product_id || '/images/' || image.id
               FROM product_images image WHERE image.product_id = p.id ORDER BY image.id LIMIT 1
             )) AS image_url, p.brand, p.stock, p.reserved_stock, p.is_available,
             p.offer_text, p.coupon_code, p.return_policy, p.return_window_days,
             p.specifications, p.category_id, c.name AS category_name,
             s.store_name, s.full_name AS seller_name,
             u.email AS seller_email, p.created_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN sellers s ON s.id = p.seller_id
      LEFT JOIN users u ON u.id = s.user_id
      ${whereClause}
      ORDER BY p.created_at DESC, p.id ASC
      `,
      values
    );

    return response.json(result.rows);
  } catch (error) {
    console.error("Admin product fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load products." });
  }
});

app.get("/api/admin/sellers", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;
  try {
    const result = await pool.query(`
      SELECT s.id, COALESCE(s.store_name, u.full_name) AS store_name, u.full_name
      FROM sellers s JOIN users u ON u.id = s.user_id
      ORDER BY store_name, s.id
    `);
    return response.json(result.rows);
  } catch (error) {
    console.error("Admin seller list failed:", error.message);
    return response.status(500).json({ message: "Unable to load sellers." });
  }
});

app.post("/api/admin/products", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;
  const { name, description, category, price, mrp_price, stock, image_url, brand, seller_id,
    specifications, offer_text, coupon_code, is_available } = request.body || {};
  const productName = String(name || "").trim();
  const sellingPrice = Number(price);
  const mrp = Number(mrp_price ?? price);
  const quantity = Number(stock);
  const sellerId = Number(seller_id);
  if (!productName || !Number.isFinite(sellingPrice) || sellingPrice <= 0 ||
      !Number.isFinite(mrp) || mrp < sellingPrice ||
      !Number.isSafeInteger(quantity) || quantity < 0 ||
      !Number.isSafeInteger(sellerId) || sellerId <= 0) {
    return response.status(400).json({ message: "Enter a product name, valid MRP and selling price, stock, and seller." });
  }
  try {
    const categoryId = await getCategoryId(category);
    const specs = typeof specifications === "string" ? JSON.parse(specifications || "{}") : (specifications || {});
    if (!specs || Array.isArray(specs) || typeof specs !== "object") {
      return response.status(400).json({ message: "Specifications must be a JSON object." });
    }
    const seller = await pool.query("SELECT id FROM sellers WHERE id = $1", [sellerId]);
    if (!seller.rows[0]) return response.status(400).json({ message: "Select a valid seller." });
    const result = await pool.query(`
      INSERT INTO products (seller_id, category_id, name, description, price, mrp_price, stock,
        image_url, brand, specifications, offer_text, coupon_code, return_policy, is_available)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
      RETURNING id
    `, [sellerId, categoryId, productName, String(description || ""), sellingPrice, mrp, quantity,
      String(image_url || ""), String(brand || ""), JSON.stringify(specs), String(offer_text || "") || null,
      String(coupon_code || "").trim().toUpperCase() || null, String(request.body?.return_policy || "") || null,
      is_available !== false]);
    return response.status(201).json({ message: "Product added.", product_id: result.rows[0].id });
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ message: "Specifications must be valid JSON." });
    console.error("Admin product creation failed:", error.message);
    return response.status(500).json({ message: "Unable to add product." });
  }
});

app.put("/api/admin/products/:id", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;
  const productId = Number(request.params.id);
  const { name, description, category, price, mrp_price, stock, image_url, brand, seller_id,
    specifications, offer_text, coupon_code, is_available } = request.body || {};
  const productName = String(name || "").trim();
  const sellingPrice = Number(price);
  const mrp = Number(mrp_price ?? price);
  const quantity = Number(stock);
  const sellerId = Number(seller_id);
  if (!Number.isSafeInteger(productId) || productId <= 0 || !productName ||
      !Number.isFinite(sellingPrice) || sellingPrice <= 0 ||
      !Number.isFinite(mrp) || mrp < sellingPrice ||
      !Number.isSafeInteger(quantity) || quantity < 0 ||
      !Number.isSafeInteger(sellerId) || sellerId <= 0 || typeof is_available !== "boolean") {
    return response.status(400).json({ message: "Product details are incomplete or invalid." });
  }
  try {
    const categoryId = await getCategoryId(category);
    const specs = typeof specifications === "string" ? JSON.parse(specifications || "{}") : (specifications || {});
    if (!specs || Array.isArray(specs) || typeof specs !== "object") {
      return response.status(400).json({ message: "Specifications must be a JSON object." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query("SELECT stock FROM products WHERE id = $1 FOR UPDATE", [productId]);
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return response.status(404).json({ message: "Product not found." });
      }
      const result = await client.query(`
        UPDATE products SET seller_id = $1, category_id = $2, name = $3, description = $4,
          price = $5, mrp_price = $6, stock = $7, image_url = $8, brand = $9,
          specifications = $10::jsonb, offer_text = $11, coupon_code = $12, return_policy = $13,
          is_available = $14, updated_at = CURRENT_TIMESTAMP
        WHERE id = $15 AND $7 >= reserved_stock
        RETURNING id
      `, [sellerId, categoryId, productName, String(description || ""), sellingPrice, mrp, quantity,
        String(image_url || ""), String(brand || ""), JSON.stringify(specs), String(offer_text || "") || null,
        String(coupon_code || "").trim().toUpperCase() || null, String(request.body?.return_policy || "") || null,
        is_available, productId]);
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return response.status(409).json({ message: "Stock cannot be lower than pending reservations." });
      }
      const quantityChange = quantity - Number(current.rows[0].stock);
      if (quantityChange) {
        await client.query(`
          INSERT INTO inventory_movements (product_id, changed_by, quantity_change, reason)
          VALUES ($1, $2, $3, 'admin_adjustment')
        `, [productId, adminUser.id, quantityChange]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return response.json({ message: "Product updated." });
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ message: "Specifications must be valid JSON." });
    console.error("Admin product update failed:", error.message);
    return response.status(500).json({ message: "Unable to update product." });
  }
});

app.get("/api/admin/reviews", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;
  try {
    const status = String(request.query.status || "pending").toLowerCase();
    if (!["pending", "approved", "rejected", "all"].includes(status)) {
      return response.status(400).json({ message: "Invalid moderation status." });
    }
    const result = await pool.query(`
      SELECT r.id, r.rating, r.review_text, r.moderation_status, r.created_at,
        p.id AS product_id, p.name AS product_name, u.full_name AS buyer_name
      FROM product_reviews r
      JOIN products p ON p.id = r.product_id
      JOIN users u ON u.id = r.buyer_id
      WHERE $1 = 'all' OR r.moderation_status = $1
      ORDER BY r.created_at DESC
      LIMIT 200
    `, [status]);
    return response.json(result.rows);
  } catch (error) {
    console.error("Admin review fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load reviews." });
  }
});

app.patch("/api/admin/reviews/:id", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;
  const reviewId = Number(request.params.id);
  const status = String(request.body?.status || "").toLowerCase();
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0 || !["approved", "rejected"].includes(status)) {
    return response.status(400).json({ message: "Choose an approval or rejection status." });
  }
  try {
    const result = await pool.query(`
      UPDATE product_reviews SET moderation_status = $1, moderated_by = $2, moderated_at = CURRENT_TIMESTAMP
      WHERE id = $3 RETURNING id
    `, [status, adminUser.id, reviewId]);
    if (!result.rowCount) return response.status(404).json({ message: "Review not found." });
    return response.json({ message: `Review ${status}.` });
  } catch (error) {
    console.error("Admin review moderation failed:", error.message);
    return response.status(500).json({ message: "Unable to moderate review." });
  }
});

app.get("/api/admin/orders", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;

  try {
    const search = String(request.query.search || "").trim();
    const status = String(request.query.status || "all").trim().toLowerCase();
    const values = [];
    const conditions = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(
        o.id::text LIKE $${values.length}
        OR LOWER(COALESCE(u.full_name, '')) LIKE LOWER($${values.length})
        OR LOWER(COALESCE(u.email, '')) LIKE LOWER($${values.length})
        OR COALESCE(o.delivery_address->>'phone', '') LIKE $${values.length}
      )`);
    }

    if (status && status !== "all") {
      values.push(status);
      conditions.push(`LOWER(COALESCE(o.status, '')) = LOWER($${values.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(`
      SELECT o.id, o.user_id, u.full_name AS buyer_name, u.email AS buyer_email,
        o.delivery_address, o.status, o.total_amount, o.created_at,
        COALESCE((SELECT p.payment_method FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_method,
        COALESCE((SELECT p.payment_status FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_status,
        (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
        COALESCE((
          SELECT json_agg(json_build_object(
            'product_id', p.id, 'product_name', COALESCE(oi.product_name_snapshot, p.name), 'quantity', oi.quantity,
            'price', oi.price, 'subtotal', oi.subtotal,
            'image_url', COALESCE(
              oi.product_image_snapshot,
              (SELECT '/api/products/' || p.id || '/images/' || pi.id
               FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.id LIMIT 1),
              p.image_url
            )
          ) ORDER BY p.name)
          FROM order_items oi JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = o.id
        ), '[]'::json) AS items,
        COALESCE((
          SELECT json_agg(json_build_object('status', h.status, 'created_at', h.created_at) ORDER BY h.created_at, h.id)
          FROM order_status_history h WHERE h.order_id = o.id
        ), '[]'::json) AS status_history
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      ${whereClause}
      ORDER BY o.created_at DESC, o.id DESC
    `, values);

    return response.json(result.rows);
  } catch (error) {
    console.error("Admin order fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load orders." });
  }
});

async function updateOrderStatus(request, response, actorId, sellerUserId = null) {
  const orderId = Number(request.params.id);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return response.status(400).json({ message: "Invalid order ID." });
  }
  const requestedStatus = String(request.body?.status || "");
  if (!ORDER_STATUS_FLOW.includes(requestedStatus)) {
    return response.status(400).json({ message: "Choose a valid order status." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT id, status FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
    const order = result.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return response.status(404).json({ message: "Order not found." });
    }
    if (sellerUserId !== null) {
      const ownership = await client.query(`
        SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE s.user_id = $2)::int AS owned
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        LEFT JOIN sellers s ON s.id = p.seller_id
        WHERE oi.order_id = $1
      `, [orderId, sellerUserId]);
      const { total, owned } = ownership.rows[0];
      if (!owned) {
        await client.query("ROLLBACK");
        return response.status(404).json({ message: "Order not found." });
      }
      if (owned !== total) {
        await client.query("ROLLBACK");
        return response.status(403).json({ message: "This order includes products from other sellers. An admin must update its status." });
      }
    }
    if (!(ORDER_STATUS_TRANSITIONS[order.status] || []).includes(requestedStatus)) {
      await client.query("ROLLBACK");
      return response.status(409).json({ message: "Order status can only move to the next step." });
    }
    await client.query(
      "UPDATE orders SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [orderId, requestedStatus]
    );
    await client.query(`
      INSERT INTO order_status_history (order_id, status, changed_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (order_id, status) DO NOTHING
    `, [orderId, requestedStatus, actorId]);
    await client.query("COMMIT");
    return response.json({ message: "Order status updated.", order_id: orderId, status: requestedStatus });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Order status update failed:", error.message);
    return response.status(500).json({ message: "Unable to update this order." });
  } finally {
    client.release();
  }
}

app.post("/api/admin/orders/:id/status", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;
  return updateOrderStatus(request, response, adminUser.id);
});

app.post("/api/seller/orders/:id/status", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;
  return updateOrderStatus(request, response, auth.user.id, auth.user.id);
});

app.delete("/api/admin/products/:id", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;

  const productId = Number(request.params.id);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return response.status(400).json({ message: "Invalid product id." });
  }

  try {
    const productCheck = await pool.query(
      "SELECT id, name FROM products WHERE id = $1 LIMIT 1",
      [productId]
    );

    if (!productCheck.rows[0]) {
      return response.status(404).json({ message: "Product not found." });
    }

    const ordered = await pool.query(
      "SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1",
      [productId]
    );

    if (ordered.rows.length > 0) {
      return response.status(409).json({
        message: "This product has existing order history and cannot be deleted safely. Please archive or hide it instead."
      });
    }

    await pool.query("DELETE FROM products WHERE id = $1", [productId]);
    return response.json({ message: "Product deleted successfully." });
  } catch (error) {
    console.error("Admin product delete failed:", error.message);
    return response.status(500).json({ message: "Unable to delete product." });
  }
});

// ============================================================
// BUYER - GET ALL PRODUCTS
// Seller-added products will appear here for Buyers
// ============================================================
app.get("/api/products", async (request, response) => {
  try {
    const search = String(request.query.search || "").trim();
    const category = String(request.query.category || "").trim();

    const values = [];
    const conditions = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`
        (
          LOWER(p.name) LIKE LOWER($${values.length})
          OR LOWER(COALESCE(p.description, '')) LIKE LOWER($${values.length})
          OR LOWER(COALESCE(p.brand, '')) LIKE LOWER($${values.length})
        )
      `);
    }

    if (category && category.toLowerCase() !== "all") {
      values.push(category);
      conditions.push(`
        (
          c.id::text = $${values.length}
          OR LOWER(COALESCE(c.name, '')) = LOWER($${values.length})
        )
      `);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        COALESCE(p.mrp_price, p.price) AS mrp_price,
        COALESCE(NULLIF(p.image_url, ''), (
          SELECT '/api/products/' || image.product_id || '/images/' || image.id
          FROM product_images image WHERE image.product_id = p.id ORDER BY image.id LIMIT 1
        )) AS image_url,
        p.brand,
        p.specifications,
        p.offer_text,
        p.coupon_code,
        p.is_available,
        (p.is_available AND p.stock > p.reserved_stock) AS in_stock,
        CASE
          WHEN NOT p.is_available THEN 'Currently Unavailable'
          WHEN p.stock <= p.reserved_stock THEN 'Out of Stock'
          ELSE 'In Stock'
        END AS availability,
        COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1)
          FROM product_reviews r
          WHERE r.product_id = p.id AND r.moderation_status = 'approved'), 0) AS average_rating,
        (SELECT COUNT(*)::int FROM product_reviews r
          WHERE r.product_id = p.id AND r.moderation_status = 'approved') AS review_count,
        COALESCE((SELECT json_agg(json_build_object(
          'id', image.id, 'url', '/api/products/' || image.product_id || '/images/' || image.id
        ) ORDER BY image.id)
          FROM product_images image WHERE image.product_id = p.id), '[]'::json) AS images,
        p.created_at,
        p.updated_at,

        c.id AS category_id,
        c.name AS category_name,

        s.id AS seller_id,
        s.store_name,
        s.full_name AS seller_name

      FROM products p

      LEFT JOIN categories c
        ON c.id = p.category_id

      LEFT JOIN sellers s
        ON s.id = p.seller_id

      ${whereClause}

      ORDER BY p.created_at DESC
      `,
      values
    );

    return response.json(result.rows);

  } catch (error) {
    console.error("Buyer product fetch failed:", error.message);

    return response.status(500).json({
      message: "Unable to load products.",
      error: error.message
    });
  }
});
app.get("/api/products/:id", async (request, response) => {
  const productId = Number(request.params.id);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return response.status(400).json({ message: "Invalid product id." });
  }

  try {
    const user = await optionalUser(request);
    const result = await pool.query(`
      SELECT p.id, p.name, p.description, p.price,
        COALESCE(p.mrp_price, p.price) AS mrp_price,
        p.seller_id, COALESCE(NULLIF(p.image_url, ''), (
          SELECT '/api/products/' || image.product_id || '/images/' || image.id
          FROM product_images image WHERE image.product_id = p.id ORDER BY image.id LIMIT 1
        )) AS image_url, p.brand, p.specifications, p.offer_text, p.coupon_code,
        p.return_policy, p.return_window_days,
        p.is_available,
        (p.is_available AND p.stock > p.reserved_stock) AS in_stock,
        CASE
          WHEN NOT p.is_available THEN 'Currently Unavailable'
          WHEN p.stock <= p.reserved_stock THEN 'Out of Stock'
          ELSE 'In Stock'
        END AS availability,
        p.stock AS exact_stock,
        p.category_id, c.name AS category_name,
        COALESCE((SELECT json_agg(json_build_object(
          'id', image.id, 'url', '/api/products/' || image.product_id || '/images/' || image.id
        ) ORDER BY image.id)
          FROM product_images image WHERE image.product_id = p.id), '[]'::json) AS images,
        COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1)
          FROM product_reviews r WHERE r.product_id = p.id AND r.moderation_status = 'approved'), 0) AS average_rating,
        (SELECT COUNT(*)::int FROM product_reviews r
          WHERE r.product_id = p.id AND r.moderation_status = 'approved') AS review_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1
      LIMIT 1
    `, [productId]);

    if (!result.rows[0]) {
      return response.status(404).json({ message: "Product not found." });
    }

    const product = result.rows[0];
    if (user?.role === "admin") {
      product.stock = product.exact_stock;
    } else if (user?.role === "seller") {
      const owner = await pool.query(
        "SELECT 1 FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.id = $1 AND s.user_id = $2",
        [productId, user.id]
      );
      if (owner.rows[0]) product.stock = product.exact_stock;
    }
    delete product.exact_stock;
    return response.json(product);
  } catch (error) {
    console.error("Product fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load product." });
  }
});

app.get("/api/products/:productId/images/:imageId", async (request, response) => {
  const { productId, imageId } = request.params;
  if (!/^[1-9]\d*$/.test(productId) || !/^[1-9]\d*$/.test(imageId)) {
    return response.status(400).json({ message: "Invalid image." });
  }
  try {
    const result = await pool.query(
      "SELECT image_data, content_type FROM product_images WHERE id = $1 AND product_id = $2",
      [imageId, productId]
    );
    if (!result.rows[0]) return response.status(404).json({ message: "Image not found." });
    response.set("Content-Type", result.rows[0].content_type);
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Cache-Control", "public, max-age=86400");
    return response.send(result.rows[0].image_data);
  } catch (error) {
    console.error("Product image fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load product image." });
  }
});

async function requireProductManager(request, response, next) {
  try {
    const auth = await requireUser(request, response);
    if (!auth) return;
    if (!["seller", "admin"].includes(auth.user.role)) {
      return response.status(403).json({ message: "Unauthorized." });
    }
    request.authUser = auth.user;
    return next();
  } catch (error) {
    return next(error);
  }
}

app.post("/api/products/:id/images", requireProductManager, uploadImages.array("images", 8), async (request, response) => {
  const user = request.authUser;
  if (!user) {
    return response.status(403).json({ message: "Unauthorized." });
  }

  const productId = Number(request.params.id);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return response.status(400).json({ message: "Invalid product id." });
  }
  const files = request.files || [];
  if (!files.length) return response.status(400).json({ message: "Choose at least one product image." });

  try {
    const product = await pool.query("SELECT seller_id FROM products WHERE id = $1", [productId]);
    if (!product.rows[0]) return response.status(404).json({ message: "Product not found." });
    if (user.role === "seller") {
      const owner = await pool.query(
        "SELECT id FROM sellers WHERE id = $1 AND user_id = $2",
        [product.rows[0].seller_id, user.id]
      );
      if (!owner.rows[0]) return response.status(403).json({ message: "You cannot update this product." });
    }
    const existing = await pool.query("SELECT COUNT(*)::int AS total FROM product_images WHERE product_id = $1", [productId]);
    if (Number(existing.rows[0].total) + files.length > 8) {
      return response.status(400).json({ message: "A product can have up to 8 images." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const file of files) {
        await client.query(
          "INSERT INTO product_images (product_id, image_data, content_type, file_name) VALUES ($1, $2, $3, $4)",
          [productId, file.buffer, file.mimetype, path.basename(file.originalname).slice(0, 255)]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return response.status(201).json({ message: "Product images uploaded.", count: files.length });
  } catch (error) {
    console.error("Product image upload failed:", error.message);
    return response.status(500).json({ message: "Unable to upload product images." });
  }
});

app.get("/api/products/:id/reviews", async (request, response) => {
  const productId = Number(request.params.id);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return response.status(400).json({ message: "Invalid product id." });
  }
  try {
    const result = await pool.query(`
      SELECT r.id, r.rating, r.review_text, r.created_at, u.full_name AS buyer_name,
        TRUE AS verified_purchase
      FROM product_reviews r
      JOIN users u ON u.id = r.buyer_id
      WHERE r.product_id = $1 AND r.moderation_status = 'approved'
      ORDER BY r.created_at DESC
      LIMIT 100
    `, [productId]);
    return response.json(result.rows);
  } catch (error) {
    console.error("Product review fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load product reviews." });
  }
});

app.post("/api/products/:id/reviews", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;
  const productId = Number(request.params.id);
  const orderItemId = Number(request.body?.order_item_id);
  const rating = Number(request.body?.rating);
  const reviewText = String(request.body?.review_text || "").trim();
  if (!Number.isSafeInteger(productId) || productId <= 0 ||
      !Number.isSafeInteger(orderItemId) || orderItemId <= 0 ||
      !Number.isInteger(rating) || rating < 1 || rating > 5 ||
      !reviewText || reviewText.length > 4000) {
    return response.status(400).json({ message: "Provide a purchase, a 1–5 star rating, and a review under 4,000 characters." });
  }
  try {
    const purchase = await pool.query(`
      SELECT oi.id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = $1 AND oi.product_id = $2 AND o.user_id = $3
        AND o.status IN ('received', 'completed')
      LIMIT 1
    `, [orderItemId, productId, auth.user.id]);
    if (!purchase.rows[0]) {
      return response.status(403).json({ message: "You can review a product after your order has been received." });
    }
    const result = await pool.query(`
      INSERT INTO product_reviews (product_id, buyer_id, order_item_id, rating, review_text)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, rating, review_text, moderation_status, created_at
    `, [productId, auth.user.id, orderItemId, rating, reviewText]);
    return response.status(201).json({ message: "Review submitted for admin moderation.", review: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return response.status(409).json({ message: "This purchase has already been reviewed." });
    }
    console.error("Product review submission failed:", error.message);
    return response.status(500).json({ message: "Unable to submit your review." });
  }
});
app.post("/api/products", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;

  const {
    name,
    description,
    category,
    category_id,
    price,
    mrp_price,
    stock,
    image_url,
    brand,
    specifications,
    offer_text,
    coupon_code,
    return_policy
  } = request.body || {};

  const productName = String(name || "").trim();
  const parsedPrice = Number(price);
  const parsedMrp = Number(mrp_price ?? price);
  const parsedStock = Number(stock || 0);

  // Validate product data
  if (
    !productName ||
    !Number.isFinite(parsedPrice) ||
    parsedPrice <= 0 ||
    !Number.isFinite(parsedMrp) ||
    parsedMrp < parsedPrice ||
    !Number.isFinite(parsedStock) ||
    parsedStock < 0
  ) {
    return response.status(400).json({
      message: "Please provide a valid product name, price, and stock."
    });
  }

  try {
    // =========================================================
    // IMPORTANT:
    // auth.user.id = users.id
    // products.seller_id = sellers.id
    //
    // So first find sellers.id using users.id
    // =========================================================

    const sellerResult = await pool.query(
      `
      SELECT id
      FROM sellers
      WHERE user_id = $1
      LIMIT 1
      `,
      [auth.user.id]
    );

    if (sellerResult.rows.length === 0) {
      return response.status(403).json({
        message: "Seller profile not found for this user."
      });
    }

    const sellerId = sellerResult.rows[0].id;


    // =========================================================
    // CATEGORY
    // =========================================================

    const resolvedCategoryId =
      category_id
        ? Number(category_id)
        : await getCategoryId(category);
    const parsedSpecifications = typeof specifications === "string"
      ? JSON.parse(specifications || "{}")
      : (specifications || {});
    if (!parsedSpecifications || Array.isArray(parsedSpecifications) || typeof parsedSpecifications !== "object") {
      return response.status(400).json({ message: "Specifications must be a JSON object." });
    }


    // =========================================================
    // INSERT PRODUCT
    // =========================================================

    const result = await pool.query(
      `
      INSERT INTO products
      (
        seller_id,
        category_id,
        name,
        description,
        price,
        mrp_price,
        stock,
        image_url,
        brand,
        specifications,
        offer_text,
        coupon_code,
        return_policy
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
      RETURNING *
      `,
      [
        sellerId,
        resolvedCategoryId || null,
        productName,
        description || "",
        parsedPrice,
        parsedMrp,
        parsedStock,
        image_url || "",
        brand || "",
        JSON.stringify(parsedSpecifications),
        String(offer_text || "") || null,
        String(coupon_code || "").trim().toUpperCase() || null,
        String(return_policy || "") || null
      ]
    );


    // =========================================================
    // SUCCESS
    // =========================================================

    return response.status(201).json({
      message: "Product added successfully.",
      product: result.rows[0]
    });

  } catch (error) {

    console.error(
      "Product creation failed:",
      error.message
    );

    return response.status(500).json({
      message: "Unable to add product.",
      error: error.message
    });
  }
});

// ============================================================
// SELLER - UPDATE PRODUCT
// ============================================================
app.put("/api/products/:id", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;

  const productId = Number(request.params.id);

  if (!Number.isFinite(productId) || productId <= 0) {
    return response.status(400).json({
      message: "Invalid product id."
    });
  }

  try {
    // ----------------------------------------------------------
    // Check that this product belongs to the logged-in seller
    // users.id -> sellers.user_id -> sellers.id -> products.seller_id
    // ----------------------------------------------------------
    const productCheck = await pool.query(
      `
      SELECT
        p.id,
        p.seller_id
      FROM products p
      JOIN sellers s
        ON s.id = p.seller_id
      WHERE p.id = $1
        AND s.user_id = $2
      LIMIT 1
      `,
      [productId, auth.user.id]
    );

    const product = productCheck.rows[0];

    if (!product) {
      return response.status(404).json({
        message: "Product not found or you are not allowed to edit it."
      });
    }

    const {
      name,
      description,
      category,
      category_id,
      price,
      mrp_price,
      stock,
      image_url,
      brand,
      specifications,
      offer_text,
      coupon_code,
      return_policy
    } = request.body || {};

    const productName = String(name || "").trim();

    const parsedPrice = Number(price);
    const parsedMrp = Number(mrp_price ?? price);
    const parsedStock = Number(stock);

    if (
      !productName ||
      !Number.isFinite(parsedPrice) ||
      parsedPrice <= 0 ||
      !Number.isFinite(parsedMrp) ||
      parsedMrp < parsedPrice ||
      !Number.isFinite(parsedStock) ||
      parsedStock < 0
    ) {
      return response.status(400).json({
        message: "Product details are incomplete or invalid."
      });
    }

    const resolvedCategoryId =
      category_id
        ? Number(category_id)
        : await getCategoryId(category);
    const parsedSpecifications = typeof specifications === "string"
      ? JSON.parse(specifications || "{}")
      : (specifications || {});
    if (!parsedSpecifications || Array.isArray(parsedSpecifications) || typeof parsedSpecifications !== "object") {
      return response.status(400).json({ message: "Specifications must be a JSON object." });
    }

    const result = await pool.query(
      `
      UPDATE products
      SET
        name = $1,
        description = $2,
        category_id = $3,
        price = $4,
        mrp_price = $5,
        stock = $6,
        image_url = $7,
        brand = $8,
        specifications = $9::jsonb,
        offer_text = $10,
        coupon_code = $11,
        return_policy = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13 AND $6 >= reserved_stock
      RETURNING *
      `,
      [
        productName,
        description || "",
        resolvedCategoryId || null,
        parsedPrice,
        parsedMrp,
        parsedStock,
        image_url || "",
        brand || "",
        JSON.stringify(parsedSpecifications),
        String(offer_text || "") || null,
        String(coupon_code || "").trim().toUpperCase() || null,
        String(return_policy || "") || null,
        productId
      ]
    );
    if (!result.rowCount) {
      return response.status(409).json({ message: "Stock cannot be lower than the quantity currently reserved." });
    }

    return response.json({
      message: "Product updated successfully.",
      product: result.rows[0]
    });

  } catch (error) {
    console.error(
      "Product update failed:",
      error.message
    );

    return response.status(500).json({
      message: "Unable to update product.",
      error: error.message
    });
  }
});

// ============================================================
// SELLER - DELETE PRODUCT
// ============================================================
app.delete("/api/products/:id", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;

  const productId = Number(request.params.id);

  if (!Number.isFinite(productId) || productId <= 0) {
    return response.status(400).json({
      message: "Invalid product id."
    });
  }

  try {
    // ----------------------------------------------------------
    // Check ownership
    // users.id -> sellers.user_id -> sellers.id -> products.seller_id
    // ----------------------------------------------------------
    const productCheck = await pool.query(
      `
      SELECT
        p.id,
        p.seller_id
      FROM products p
      JOIN sellers s
        ON s.id = p.seller_id
      WHERE p.id = $1
        AND s.user_id = $2
      LIMIT 1
      `,
      [productId, auth.user.id]
    );

    const product = productCheck.rows[0];

    if (!product) {
      return response.status(404).json({
        message: "Product not found or you are not allowed to delete it."
      });
    }

    await pool.query(
      "DELETE FROM products WHERE id = $1",
      [productId]
    );

    return response.json({
      message: "Product deleted successfully."
    });

  } catch (error) {
    console.error(
      "Product delete failed:",
      error.message
    );

    return response.status(500).json({
      message: "Unable to delete product.",
      error: error.message
    });
  }
});

app.get("/api/seller/products", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;

  try {
    const result = await pool.query(`
      SELECT p.id, p.name, p.description, p.price, p.stock, p.reserved_stock,
             COALESCE(NULLIF(p.image_url, ''), (
               SELECT '/api/products/' || image.product_id || '/images/' || image.id
               FROM product_images image WHERE image.product_id = p.id ORDER BY image.id LIMIT 1
             )) AS image_url, p.brand,
             COALESCE(p.mrp_price, p.price) AS mrp_price, p.reserved_stock,
             p.specifications, p.offer_text, p.coupon_code, p.return_policy,
             p.is_available, p.category_id, c.name AS category_name
      FROM products p
      JOIN sellers s ON s.id = p.seller_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE s.user_id = $1
      ORDER BY p.created_at DESC
    `, [auth.user.id]);
    return response.json(result.rows);
  } catch (error) {
    console.error("Seller product fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load your products." });
  }
});

app.get("/api/seller/orders", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;

  try {
    const result = await pool.query(`
      SELECT o.id AS order_id, buyer.full_name AS buyer_name,
             p.name AS product_name, oi.quantity, oi.subtotal,
             o.total_amount, o.status, o.created_at,
             COALESCE((SELECT p.payment_method FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_method,
             COALESCE((SELECT p.payment_status FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_status,
             NOT EXISTS (
               SELECT 1 FROM order_items other_item
               JOIN products other_product ON other_product.id = other_item.product_id
               LEFT JOIN sellers other_seller ON other_seller.id = other_product.seller_id
               WHERE other_item.order_id = o.id AND other_seller.user_id IS DISTINCT FROM s.user_id
             ) AS can_update_status
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN sellers s ON s.id = p.seller_id
      JOIN users buyer ON buyer.id = o.user_id
      WHERE s.user_id = $1
      ORDER BY o.created_at DESC
    `, [auth.user.id]);
    return response.json(result.rows);
  } catch (error) {
    console.error("Seller order fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load your orders." });
  }
});

app.get("/api/cart", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  try {
    return response.json(await getCartSummary(auth.user.id));
  } catch (error) {
    console.error("Cart fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load cart." });
  }
});

app.post("/api/cart/items", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  const productId = Number(request.body?.product_id);
  const quantity = Number(request.body?.quantity ?? 1);
  if (!Number.isSafeInteger(productId) || productId <= 0 ||
      !Number.isSafeInteger(quantity) || quantity <= 0) {
    return response.status(400).json({ message: "Invalid product or quantity." });
  }

  try {
    const productResult = await pool.query(
      "SELECT id, price, stock, reserved_stock, is_available FROM products WHERE id = $1 LIMIT 1",
      [productId]
    );
    const product = productResult.rows[0];
    if (!product) return response.status(404).json({ message: "Product not found." });

    const cartId = await ensureBuyerCart(auth.user.id);
    const existingResult = await pool.query(
      "SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2 LIMIT 1",
      [cartId, productId]
    );
    const existing = existingResult.rows[0];
    const nextQuantity = Number(existing?.quantity || 0) + quantity;
    if (!product.is_available || nextQuantity > Number(product.stock) - Number(product.reserved_stock)) {
      return response.status(400).json({ message: "Requested quantity exceeds available stock." });
    }

    if (existing) {
      await pool.query(
        "UPDATE cart_items SET quantity = $1, price = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [nextQuantity, product.price, existing.id]
      );
    } else {
      await pool.query(
        "INSERT INTO cart_items (cart_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)",
        [cartId, productId, quantity, product.price]
      );
    }

    return response.status(201).json({ message: "Added to cart." });
  } catch (error) {
    console.error("Add to cart failed:", error.message);
    return response.status(500).json({ message: "Unable to add item to cart." });
  }
});

app.put("/api/cart/items/:itemId", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  const itemId = Number(request.params.itemId);
  const quantity = Number(request.body?.quantity);
  if (!Number.isSafeInteger(itemId) || itemId <= 0 ||
      !Number.isSafeInteger(quantity) || quantity <= 0) {
    return response.status(400).json({ message: "Invalid cart item or quantity." });
  }

  try {
    const cartId = await ensureBuyerCart(auth.user.id);
    const itemResult = await pool.query(`
      SELECT ci.id, p.stock, p.reserved_stock, p.is_available, p.price
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.id = $1 AND ci.cart_id = $2
      LIMIT 1
    `, [itemId, cartId]);
    const item = itemResult.rows[0];
    if (!item) return response.status(404).json({ message: "Cart item not found." });
    if (!item.is_available || quantity > Number(item.stock) - Number(item.reserved_stock)) {
      return response.status(400).json({ message: "Requested quantity exceeds available stock." });
    }

    await pool.query(
      "UPDATE cart_items SET quantity = $1, price = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
      [quantity, item.price, itemId]
    );
    return response.json({ message: "Cart updated." });
  } catch (error) {
    console.error("Cart update failed:", error.message);
    return response.status(500).json({ message: "Unable to update cart." });
  }
});

app.delete("/api/cart/items/:itemId", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  const itemId = Number(request.params.itemId);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    return response.status(400).json({ message: "Invalid cart item." });
  }

  try {
    const cartId = await ensureBuyerCart(auth.user.id);
    const result = await pool.query(
      "DELETE FROM cart_items WHERE id = $1 AND cart_id = $2",
      [itemId, cartId]
    );
    if (!result.rowCount) return response.status(404).json({ message: "Cart item not found." });
    return response.json({ message: "Item removed from cart." });
  } catch (error) {
    console.error("Cart item removal failed:", error.message);
    return response.status(500).json({ message: "Unable to remove item from cart." });
  }
});

app.delete("/api/cart", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  try {
    const cartId = await ensureBuyerCart(auth.user.id);
    await pool.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
    return response.json({ message: "Cart cleared." });
  } catch (error) {
    console.error("Cart clear failed:", error.message);
    return response.status(500).json({ message: "Unable to clear cart." });
  }
});

app.get("/api/wishlist", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  try {
    const result = await pool.query(`
      SELECT wi.id, wi.product_id, p.name, p.description, p.price, p.image_url, c.name AS category_name
      FROM wishlist_items wi
      JOIN products p ON p.id = wi.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE wi.buyer_id = $1
      ORDER BY wi.created_at DESC
    `, [auth.user.id]);

    return response.json(result.rows);
  } catch (error) {
    console.error("Wishlist fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load wishlist." });
  }
});

app.post("/api/wishlist", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  const productId = Number(request.body?.product_id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return response.status(400).json({ message: "Invalid product." });
  }

  try {
    const productExists = await pool.query("SELECT id FROM products WHERE id = $1 LIMIT 1", [productId]);
    if (!productExists.rows[0]) {
      return response.status(404).json({ message: "Product not found." });
    }

    const exists = await pool.query(
      "SELECT id FROM wishlist_items WHERE buyer_id = $1 AND product_id = $2 LIMIT 1",
      [auth.user.id, productId]
    );

    if (exists.rows[0]) {
      return response.status(200).json({ message: "Product already saved to wishlist." });
    }

    const result = await pool.query(
      "INSERT INTO wishlist_items (buyer_id, product_id) VALUES ($1, $2) RETURNING *",
      [auth.user.id, productId]
    );

    return response.status(201).json({ message: "Added to wishlist.", item: result.rows[0] });
  } catch (error) {
    console.error("Wishlist save failed:", error.message);
    return response.status(500).json({ message: "Unable to save wishlist item." });
  }
});

app.delete("/api/wishlist/:productId", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  const productId = Number(request.params.productId);
  if (!Number.isFinite(productId)) {
    return response.status(400).json({ message: "Invalid product id." });
  }

  try {
    const result = await pool.query(
      "DELETE FROM wishlist_items WHERE buyer_id = $1 AND product_id = $2",
      [auth.user.id, productId]
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ message: "Wishlist item not found." });
    }

    return response.json({ message: "Removed from wishlist." });
  } catch (error) {
    console.error("Wishlist delete failed:", error.message);
    return response.status(500).json({ message: "Unable to remove wishlist item." });
  }
});

app.get("/api/orders", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  try {
    const result = await pool.query(`
      SELECT o.id, o.total_amount, o.status, o.created_at, o.delivery_address,
             COALESCE((SELECT p.payment_method FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_method,
             COALESCE((SELECT p.payment_status FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_status,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'order_item_id', oi.id, 'product_id', p.id, 'product_name', COALESCE(oi.product_name_snapshot, p.name),
                 'quantity', oi.quantity, 'price', oi.price, 'subtotal', oi.subtotal,
                 'image_url', COALESCE(
                   oi.product_image_snapshot,
                   (SELECT '/api/products/' || p.id || '/images/' || pi.id
                    FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.id LIMIT 1),
                   p.image_url
                 ),
                 'reviewed', EXISTS(SELECT 1 FROM product_reviews r WHERE r.order_item_id = oi.id)
               ) ORDER BY p.name)
               FROM order_items oi JOIN products p ON p.id = oi.product_id
               WHERE oi.order_id = o.id
             ), '[]'::json) AS items,
             COALESCE((
               SELECT json_agg(json_build_object('status', h.status, 'created_at', h.created_at) ORDER BY h.created_at, h.id)
               FROM order_status_history h WHERE h.order_id = o.id
             ), '[]'::json) AS status_history
      FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
    `, [auth.user.id]);

    return response.json(result.rows);
  } catch (error) {
    console.error("Order fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load your orders." });
  }
});

app.get("/api/orders/:id", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  try {
    const result = await pool.query(`
      SELECT o.*,
             COALESCE((SELECT p.payment_method FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_method,
             COALESCE((SELECT p.payment_status FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_status,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'order_item_id', oi.id, 'product_id', p.id, 'product_name', COALESCE(oi.product_name_snapshot, p.name),
                 'quantity', oi.quantity, 'price', oi.price, 'subtotal', oi.subtotal,
                 'image_url', COALESCE(
                   oi.product_image_snapshot,
                   (SELECT '/api/products/' || p.id || '/images/' || pi.id
                    FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.id LIMIT 1),
                   p.image_url
                 ),
                 'reviewed', EXISTS(SELECT 1 FROM product_reviews r WHERE r.order_item_id = oi.id)
               ) ORDER BY p.name)
               FROM order_items oi JOIN products p ON p.id = oi.product_id
               WHERE oi.order_id = o.id
             ), '[]'::json) AS items,
             COALESCE((
               SELECT json_agg(json_build_object('status', h.status, 'created_at', h.created_at) ORDER BY h.created_at, h.id)
               FROM order_status_history h WHERE h.order_id = o.id
             ), '[]'::json) AS status_history
      FROM orders o
      WHERE o.id = $1 AND o.user_id = $2
    `, [request.params.id, auth.user.id]);

    if (!result.rows[0]) {
      return response.status(404).json({ message: "Order not found." });
    }

    return response.json(result.rows[0]);
  } catch (error) {
    console.error("Single order fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load order." });
  }
});

app.post("/api/orders/:id/received", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;
  const orderId = Number(request.params.id);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return response.status(400).json({ message: "Invalid order ID." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT id, status FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [orderId, auth.user.id]
    );
    const order = result.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return response.status(404).json({ message: "Order not found." });
    }
    if (order.status !== "on_the_way") {
      await client.query("ROLLBACK");
      return response.status(409).json({ message: "Only an order on the way can be confirmed as received." });
    }

    await client.query(
      "UPDATE orders SET status = 'received', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [orderId]
    );
    await client.query(`
      INSERT INTO order_status_history (order_id, status, changed_by)
      VALUES ($1, 'received', $2)
      ON CONFLICT (order_id, status) DO NOTHING
    `, [orderId, auth.user.id]);
    const completionUpdate = await client.query(
      "UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'received'",
      [orderId]
    );
    if (!completionUpdate.rowCount) throw new Error("Order could not be completed from its current status.");
    const completed = await client.query(`
      INSERT INTO order_status_history (order_id, status, changed_by)
      VALUES ($1, 'completed', $2)
      ON CONFLICT (order_id, status) DO NOTHING
      RETURNING created_at
    `, [orderId, auth.user.id]);
    const received = await client.query(
      "SELECT created_at FROM order_status_history WHERE order_id = $1 AND status = 'received'",
      [orderId]
    );
    await client.query("COMMIT");
    return response.json({
      message: "Receipt confirmed. Your order is completed.",
      order_id: orderId,
      status: "completed",
      received_at: received.rows[0]?.created_at || null,
      completed_at: completed.rows[0]?.created_at || null
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Buyer receipt confirmation failed:", error.message);
    return response.status(500).json({ message: "Unable to confirm order receipt." });
  } finally {
    client.release();
  }
});

app.get("/api/checkout/quote", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;
  try {
    await releaseExpiredReservations();
    const result = await pool.query(`
      SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price,
        COALESCE(p.mrp_price, p.price) AS mrp_price,
        p.stock - p.reserved_stock AS available_stock, p.is_available
      FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
      JOIN products p ON p.id = ci.product_id
      WHERE c.user_id = $1 ORDER BY ci.id
    `, [auth.user.id]);
    if (!result.rows.length) return response.status(400).json({ message: "Your cart is empty." });
    const items = result.rows.map((item) => {
      const quantity = Number(item.quantity);
      if (!item.is_available || quantity > Number(item.available_stock)) {
        throw new Error(`${item.name} is currently unavailable in the requested quantity.`);
      }
      return {
        product_id: item.product_id, name: item.name, quantity,
        price: Number(item.price), mrp_price: Number(item.mrp_price),
        subtotal: Number(item.price) * quantity
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const discount = items.reduce((sum, item) => sum + (item.mrp_price - item.price) * item.quantity, 0);
    return response.json({ items, subtotal: Number(subtotal.toFixed(2)),
      discount: Number(discount.toFixed(2)), delivery: 0, total: Number(subtotal.toFixed(2)) });
  } catch (error) {
    if (error.message.includes("currently unavailable")) return response.status(409).json({ message: error.message });
    console.error("Checkout quote failed:", error.message);
    return response.status(500).json({ message: "Unable to calculate checkout total." });
  }
});

app.get("/api/addresses", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;
  try {
    const result = await pool.query(`
      SELECT id, recipient_name, phone, address_line1, address_line2, city, state, postal_code
      FROM delivery_addresses WHERE user_id = $1 ORDER BY updated_at DESC
    `, [auth.user.id]);
    return response.json(result.rows);
  } catch (error) {
    console.error("Delivery address fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load delivery addresses." });
  }
});

app.post("/api/orders", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;
  const idempotencyKey = String(request.headers["idempotency-key"] || "");
  if (!/^[\w-]{16,100}$/.test(idempotencyKey)) {
    return response.status(400).json({ message: "A valid order request key is required." });
  }

  const address = request.body?.address || {};
  const addressId = request.body?.address_id ? Number(request.body.address_id) : null;
  if (!addressId && (
    !String(address.recipient_name || "").trim() ||
    !/^\+?[0-9\s()-]{8,20}$/.test(String(address.phone || "").trim()) ||
    !String(address.address_line1 || "").trim() ||
    !String(address.city || "").trim() ||
    !String(address.state || "").trim() ||
    !/^[A-Za-z0-9 -]{4,10}$/.test(String(address.postal_code || "").trim())
  )) {
    return response.status(400).json({ message: "Enter a complete delivery address and valid phone number." });
  }

  const findExistingOrder = () => pool.query(
    "SELECT id, status, total_amount FROM orders WHERE user_id = $1 AND idempotency_key = $2",
    [auth.user.id, idempotencyKey]
  );
  const existingOrderResponse = (order) => response.json({
    message: "Order Placed Successfully",
    order_id: order.id,
    status: order.status,
    payment_method: PAYMENT_METHOD_COD,
    total: Number(order.total_amount)
  });

  try {
    await releaseExpiredReservations();
    const existing = await findExistingOrder();
    if (existing.rows[0]) return existingOrderResponse(existing.rows[0]);

    const client = await pool.connect();
    let order;
    let amount;
    try {
      await client.query("BEGIN");
      const cart = await client.query(`
        SELECT ci.id AS cart_item_id, ci.product_id, ci.quantity, p.name, p.price,
          COALESCE(
            (SELECT '/api/products/' || p.id || '/images/' || pi.id
             FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.id LIMIT 1),
            p.image_url
          ) AS product_image_snapshot,
          COALESCE(p.mrp_price, p.price) AS mrp_price, p.stock, p.reserved_stock,
          p.seller_id, p.is_available
        FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
        JOIN products p ON p.id = ci.product_id
        WHERE c.user_id = $1 ORDER BY p.id, ci.id FOR UPDATE OF p, ci
      `, [auth.user.id]);
      if (!cart.rows.length) throw Object.assign(new Error("Your cart is empty."), { status: 400, cartEmpty: true });
      const quantities = new Map();
      for (const item of cart.rows) {
        quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + Number(item.quantity));
        if (!item.is_available) throw Object.assign(new Error(`${item.name} is currently unavailable.`), { status: 409 });
      }
      for (const [productId, quantity] of quantities) {
        const product = cart.rows.find((item) => Number(item.product_id) === Number(productId));
        if (quantity > Number(product.stock) - Number(product.reserved_stock)) {
          throw Object.assign(new Error(`${product.name} is no longer available in the requested quantity.`), { status: 409 });
        }
      }

      let savedAddress;
      if (addressId) {
        const saved = await client.query(`
          SELECT id, recipient_name, phone, address_line1, address_line2, city, state, postal_code
          FROM delivery_addresses WHERE id = $1 AND user_id = $2
        `, [addressId, auth.user.id]);
        if (!saved.rows[0]) throw Object.assign(new Error("Select a valid delivery address."), { status: 400 });
        savedAddress = saved.rows[0];
      } else {
        const saved = await client.query(`
          INSERT INTO delivery_addresses (user_id, recipient_name, phone, address_line1, address_line2, city, state, postal_code)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, recipient_name, phone, address_line1, address_line2, city, state, postal_code
        `, [auth.user.id, String(address.recipient_name).trim(), String(address.phone).trim(),
          String(address.address_line1).trim(), String(address.address_line2 || "").trim() || null,
          String(address.city).trim(), String(address.state).trim(), String(address.postal_code).trim()]);
        savedAddress = saved.rows[0];
      }

      const subtotal = cart.rows.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
      const discount = cart.rows.reduce((sum, item) =>
        sum + (Number(item.mrp_price) - Number(item.price)) * Number(item.quantity), 0);
      amount = Number(subtotal.toFixed(2));
      if (!(amount > 0)) throw Object.assign(new Error("Invalid order total."), { status: 400 });

      const created = await client.query(`
        INSERT INTO orders (user_id, total_amount, subtotal, discount_amount, shipping_amount,
          delivery_address, status, inventory_committed, idempotency_key)
        VALUES ($1, $2, $2, $3, 0, $4::jsonb, 'confirmed', TRUE, $5)
        RETURNING id
      `, [auth.user.id, amount, Number(discount.toFixed(2)), JSON.stringify(savedAddress), idempotencyKey]);
      order = created.rows[0];
      for (const [productId, quantity] of quantities) {
        const updated = await client.query(`
          UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND is_available = TRUE AND stock - reserved_stock >= $1
          RETURNING id
        `, [quantity, productId]);
        if (!updated.rowCount) throw Object.assign(new Error("Stock changed while placing your order. Refresh your cart and try again."), { status: 409 });
        await client.query(`
          INSERT INTO inventory_movements (product_id, changed_by, order_id, quantity_change, reason)
          VALUES ($1, $2, $3, $4, 'purchase')
        `, [productId, auth.user.id, order.id, -quantity]);
      }
      for (const item of cart.rows) {
        await client.query(`
          INSERT INTO order_items (
            order_id, product_id, seller_id, quantity, price, mrp_price, subtotal,
            product_name_snapshot, product_image_snapshot, cart_item_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [order.id, item.product_id, item.seller_id, item.quantity, item.price,
          item.mrp_price, Number(item.price) * Number(item.quantity), item.name,
          item.product_image_snapshot, item.cart_item_id]);
      }
      await client.query(`
        INSERT INTO order_status_history (order_id, status, changed_by)
        VALUES ($1, 'confirmed', $2)
      `, [order.id, auth.user.id]);
      await client.query(`
        INSERT INTO payments (order_id, payment_method, payment_status, amount)
        VALUES ($1, $2, 'pending', $3)
      `, [order.id, PAYMENT_METHOD_COD, amount]);
      await client.query(
        "DELETE FROM cart_items WHERE id = ANY($1::int[])",
        [cart.rows.map((item) => item.cart_item_id)]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return response.status(201).json({
      message: "Order Placed Successfully",
      order_id: order.id,
      status: "confirmed",
      payment_method: PAYMENT_METHOD_COD,
      total: amount
    });
  } catch (error) {
    // A duplicate submit that raced the first one either hits the unique key or finds the cart already emptied.
    if (error.constraint === "idx_orders_idempotency" || error.cartEmpty) {
      const repeated = await findExistingOrder();
      if (repeated.rows[0]) return existingOrderResponse(repeated.rows[0]);
    }
    const status = error.status || 500;
    if (status === 500) console.error("Order creation failed:", error.message);
    return response.status(status).json({ message: status === 500 ? "Unable to place your order." : error.message });
  }
});

app.use((error, _request, response, next) => {
  if (response.headersSent) return next(error);
  const status = error instanceof multer.MulterError
    ? (error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
    : (error.message?.startsWith("Only JPEG") ? 400 : 500);
  if (status === 500) console.error("Unhandled request error:", error.message);
  return response.status(status).json({
    message: status === 413 ? "Each product image must be 512 KiB or smaller." :
      status === 400 ? (error.message || "Invalid file upload.") : "The request could not be completed."
  });
});

async function startServer() {
  await getSchemaReady();
  app.listen(PORT, () => {
    console.log(`SIVA_MART login server is running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server failed to start:", error?.stack || error);
    process.exit(1);
  });
}

module.exports = app;
