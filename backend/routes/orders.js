// Everything about orders: checkout, tracking, and status updates for buyers, sellers, and admins.
const express = require("express");
const { requireAdmin, requireUser } = require("../auth");
const { pool } = require("../database");

const router = express.Router();

// SQL snippets used by more than one order query.
const ORDER_PAYMENT = `COALESCE((SELECT p.payment_method FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_method,
COALESCE((SELECT p.payment_status FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1), 'unknown') AS payment_status`;
const BUYER_ORDER_DETAILS = `COALESCE((
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
), '[]'::json) AS status_history`;

const PAYMENT_METHOD_COD = "Cash on Delivery";
const ORDER_STATUS_FLOW = ["confirmed", "processing", "on_the_way", "received", "completed"];
const ORDER_STATUS_TRANSITIONS = {
  confirmed: ["on_the_way", "processing"],
  processing: ["on_the_way"],
  on_the_way: ["received"],
  received: ["completed"]
};

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

router.get("/api/checkout/quote", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;
  try {
    const result = await pool.query(`
      SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price,
        COALESCE(p.mrp_price, p.price) AS mrp_price,
        p.stock AS available_stock, p.is_available
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

router.get("/api/addresses", async (request, response) => {
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

router.post("/api/orders", async (request, response) => {
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
          COALESCE(p.mrp_price, p.price) AS mrp_price, p.stock,
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
        if (quantity > Number(product.stock)) {
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
          delivery_address, status, idempotency_key)
        VALUES ($1, $2, $2, $3, 0, $4::jsonb, 'confirmed', $5)
        RETURNING id
      `, [auth.user.id, amount, Number(discount.toFixed(2)), JSON.stringify(savedAddress), idempotencyKey]);
      order = created.rows[0];
      for (const [productId, quantity] of quantities) {
        const updated = await client.query(`
          UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND is_available = TRUE AND stock >= $1
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

router.get("/api/orders", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  try {
    const result = await pool.query(`
      SELECT o.id, o.total_amount, o.status, o.created_at, o.delivery_address,
             ${ORDER_PAYMENT},
             ${BUYER_ORDER_DETAILS}
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

router.get("/api/orders/:id", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  try {
    const result = await pool.query(`
      SELECT o.*,
             ${ORDER_PAYMENT},
             ${BUYER_ORDER_DETAILS}
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

router.post("/api/orders/:id/received", async (request, response) => {
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

router.get("/api/seller/orders", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;

  try {
    const result = await pool.query(`
      SELECT o.id AS order_id, buyer.full_name AS buyer_name,
             p.name AS product_name, oi.quantity, oi.subtotal,
             o.total_amount, o.status, o.created_at,
             ${ORDER_PAYMENT},
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

router.post("/api/seller/orders/:id/status", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;
  return updateOrderStatus(request, response, auth.user.id, auth.user.id);
});

router.get("/api/admin/orders", async (request, response) => {
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
        ${ORDER_PAYMENT},
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

router.post("/api/admin/orders/:id/status", async (request, response) => {
  const adminUser = await requireAdmin(request, response);
  if (!adminUser) return;
  return updateOrderStatus(request, response, adminUser.id);
});

module.exports = router;
