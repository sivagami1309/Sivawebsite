// Registration and login.
const express = require("express");
const bcrypt = require("bcryptjs");
const { createAuthToken } = require("../auth");
const { pool } = require("../database");
const { ensureBuyerCart } = require("./cart");

const router = express.Router();

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

router.post("/api/register", async (request, response) => {
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

router.post("/api/login", async (request, response) => {
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

module.exports = router;
