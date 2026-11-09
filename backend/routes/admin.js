// Admin dashboard: statistics, users, products, and review moderation. Admin order screens are in orders.js.
const express = require("express");
const { requireAdmin } = require("../auth");
const { pool } = require("../database");
const { getCategoryId, parseSpecifications, PRODUCT_IMAGE_URL } = require("./products");

const router = express.Router();

router.get("/api/admin/stats", async (request, response) => {
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

router.get("/api/admin/users", async (request, response) => {
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

router.get("/api/admin/products", async (request, response) => {
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
             p.seller_id, ${PRODUCT_IMAGE_URL}, p.brand, p.stock, p.is_available,
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

router.get("/api/admin/sellers", async (request, response) => {
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

router.post("/api/admin/products", async (request, response) => {
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
    const specs = parseSpecifications(specifications);
    if (!specs) {
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

router.put("/api/admin/products/:id", async (request, response) => {
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
    const specs = parseSpecifications(specifications);
    if (!specs) {
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
      await client.query(`
        UPDATE products SET seller_id = $1, category_id = $2, name = $3, description = $4,
          price = $5, mrp_price = $6, stock = $7, image_url = $8, brand = $9,
          specifications = $10::jsonb, offer_text = $11, coupon_code = $12, return_policy = $13,
          is_available = $14, updated_at = CURRENT_TIMESTAMP
        WHERE id = $15
      `, [sellerId, categoryId, productName, String(description || ""), sellingPrice, mrp, quantity,
        String(image_url || ""), String(brand || ""), JSON.stringify(specs), String(offer_text || "") || null,
        String(coupon_code || "").trim().toUpperCase() || null, String(request.body?.return_policy || "") || null,
        is_available, productId]);
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

router.delete("/api/admin/products/:id", async (request, response) => {
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

    await pool.query("DELETE FROM inventory_movements WHERE product_id = $1", [productId]);
    await pool.query("DELETE FROM products WHERE id = $1", [productId]);
    return response.json({ message: "Product deleted successfully." });
  } catch (error) {
    console.error("Admin product delete failed:", error.message);
    return response.status(500).json({ message: "Unable to delete product." });
  }
});

router.get("/api/admin/reviews", async (request, response) => {
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

router.patch("/api/admin/reviews/:id", async (request, response) => {
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

module.exports = router;
