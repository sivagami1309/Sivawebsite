// The buyer's cart and wishlist.
const express = require("express");
const { requireUser } = require("../auth");
const { pool } = require("../database");

const router = express.Router();

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
           p.is_available AND p.stock > 0 AS in_stock,
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

router.get("/api/cart", async (request, response) => {
  const auth = await requireUser(request, response, "buyer");
  if (!auth) return;

  try {
    return response.json(await getCartSummary(auth.user.id));
  } catch (error) {
    console.error("Cart fetch failed:", error.message);
    return response.status(500).json({ message: "Unable to load cart." });
  }
});

router.post("/api/cart/items", async (request, response) => {
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
      "SELECT id, price, stock, is_available FROM products WHERE id = $1 LIMIT 1",
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
    if (!product.is_available || nextQuantity > Number(product.stock)) {
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

router.put("/api/cart/items/:itemId", async (request, response) => {
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
      SELECT ci.id, p.stock, p.is_available, p.price
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.id = $1 AND ci.cart_id = $2
      LIMIT 1
    `, [itemId, cartId]);
    const item = itemResult.rows[0];
    if (!item) return response.status(404).json({ message: "Cart item not found." });
    if (!item.is_available || quantity > Number(item.stock)) {
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

router.delete("/api/cart/items/:itemId", async (request, response) => {
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

router.delete("/api/cart", async (request, response) => {
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

router.get("/api/wishlist", async (request, response) => {
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

router.post("/api/wishlist", async (request, response) => {
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

router.delete("/api/wishlist/:productId", async (request, response) => {
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

module.exports = router;
module.exports.ensureBuyerCart = ensureBuyerCart;
