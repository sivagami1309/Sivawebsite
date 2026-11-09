// Public product pages, images, reviews, and the seller's own product management.
const express = require("express");
const path = require("path");
const multer = require("multer");
const { optionalUser, requireUser } = require("../auth");
const { pool } = require("../database");

const router = express.Router();

// SQL snippets used by more than one product query.
const PRODUCT_IMAGE_URL = `COALESCE(NULLIF(p.image_url, ''), (
  SELECT '/api/products/' || image.product_id || '/images/' || image.id
  FROM product_images image WHERE image.product_id = p.id ORDER BY image.id LIMIT 1
)) AS image_url`;
const PRODUCT_IMAGES = `COALESCE((SELECT json_agg(json_build_object(
  'id', image.id, 'url', '/api/products/' || image.product_id || '/images/' || image.id
) ORDER BY image.id)
  FROM product_images image WHERE image.product_id = p.id), '[]'::json) AS images`;
const PRODUCT_RATING = `COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1)
  FROM product_reviews r WHERE r.product_id = p.id AND r.moderation_status = 'approved'), 0) AS average_rating,
(SELECT COUNT(*)::int FROM product_reviews r
  WHERE r.product_id = p.id AND r.moderation_status = 'approved') AS review_count`;
const PRODUCT_AVAILABILITY = `(p.is_available AND p.stock > 0) AS in_stock,
CASE
  WHEN NOT p.is_available THEN 'Currently Unavailable'
  WHEN p.stock <= 0 THEN 'Out of Stock'
  ELSE 'In Stock'
END AS availability`;

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

// Returns the parsed object, or null if it is valid JSON but not an object. Invalid JSON throws a SyntaxError.
function parseSpecifications(value) {
  const specifications = typeof value === "string" ? JSON.parse(value || "{}") : (value || {});
  return specifications && !Array.isArray(specifications) && typeof specifications === "object" ? specifications : null;
}

async function findSellerProduct(productId, userId) {
  const result = await pool.query(
    "SELECT p.id FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.id = $1 AND s.user_id = $2 LIMIT 1",
    [productId, userId]
  );
  return result.rows[0] || null;
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

router.get("/api/categories", async (_request, response) => {
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

router.get("/api/products", async (request, response) => {
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
        ${PRODUCT_IMAGE_URL},
        p.brand,
        p.specifications,
        p.offer_text,
        p.coupon_code,
        p.is_available,
        ${PRODUCT_AVAILABILITY},
        ${PRODUCT_RATING},
        ${PRODUCT_IMAGES},
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
      message: "Unable to load products." });
  }
});

router.get("/api/products/:id", async (request, response) => {
  const productId = Number(request.params.id);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return response.status(400).json({ message: "Invalid product id." });
  }

  try {
    const user = await optionalUser(request);
    const result = await pool.query(`
      SELECT p.id, p.name, p.description, p.price,
        COALESCE(p.mrp_price, p.price) AS mrp_price,
        p.seller_id, ${PRODUCT_IMAGE_URL}, p.brand, p.specifications, p.offer_text, p.coupon_code,
        p.return_policy, p.return_window_days,
        p.is_available,
        ${PRODUCT_AVAILABILITY},
        p.stock AS exact_stock,
        p.category_id, c.name AS category_name,
        ${PRODUCT_IMAGES},
        ${PRODUCT_RATING}
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

router.get("/api/products/:productId/images/:imageId", async (request, response) => {
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

router.post("/api/products/:id/images", requireProductManager, uploadImages.array("images", 8), async (request, response) => {
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

router.get("/api/products/:id/reviews", async (request, response) => {
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

router.post("/api/products/:id/reviews", async (request, response) => {
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

router.post("/api/products", async (request, response) => {
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


    const resolvedCategoryId =
      category_id
        ? Number(category_id)
        : await getCategoryId(category);
    const parsedSpecifications = parseSpecifications(specifications);
    if (!parsedSpecifications) {
      return response.status(400).json({ message: "Specifications must be a JSON object." });
    }


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


    return response.status(201).json({
      message: "Product added successfully.",
      product: result.rows[0]
    });

  } catch (error) {

    if (error instanceof SyntaxError) return response.status(400).json({ message: "Specifications must be valid JSON." });
    console.error(
      "Product creation failed:",
      error.message
    );

    return response.status(500).json({
      message: "Unable to add product." });
  }
});

router.put("/api/products/:id", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;

  const productId = Number(request.params.id);

  if (!Number.isFinite(productId) || productId <= 0) {
    return response.status(400).json({
      message: "Invalid product id."
    });
  }

  try {
    const product = await findSellerProduct(productId, auth.user.id);

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
    const parsedSpecifications = parseSpecifications(specifications);
    if (!parsedSpecifications) {
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
      WHERE id = $13
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

    return response.json({
      message: "Product updated successfully.",
      product: result.rows[0]
    });

  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ message: "Specifications must be valid JSON." });
    console.error(
      "Product update failed:",
      error.message
    );

    return response.status(500).json({
      message: "Unable to update product." });
  }
});

router.delete("/api/products/:id", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;

  const productId = Number(request.params.id);

  if (!Number.isFinite(productId) || productId <= 0) {
    return response.status(400).json({
      message: "Invalid product id."
    });
  }

  try {
    const product = await findSellerProduct(productId, auth.user.id);

    if (!product) {
      return response.status(404).json({
        message: "Product not found or you are not allowed to delete it."
      });
    }

    const ordered = await pool.query("SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1", [productId]);
    if (ordered.rows.length > 0) {
      return response.status(409).json({
        message: "This product has order history and cannot be deleted."
      });
    }

    await pool.query("DELETE FROM inventory_movements WHERE product_id = $1", [productId]);
    await pool.query("DELETE FROM products WHERE id = $1", [productId]);

    return response.json({
      message: "Product deleted successfully."
    });

  } catch (error) {
    console.error(
      "Product delete failed:",
      error.message
    );

    return response.status(500).json({
      message: "Unable to delete product." });
  }
});

router.get("/api/seller/products", async (request, response) => {
  const auth = await requireUser(request, response, "seller");
  if (!auth) return;

  try {
    const result = await pool.query(`
      SELECT p.id, p.name, p.description, p.price, p.stock,
             ${PRODUCT_IMAGE_URL}, p.brand,
             COALESCE(p.mrp_price, p.price) AS mrp_price,
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

module.exports = router;
module.exports.getCategoryId = getCategoryId;
module.exports.parseSpecifications = parseSpecifications;
module.exports.PRODUCT_IMAGE_URL = PRODUCT_IMAGE_URL;
