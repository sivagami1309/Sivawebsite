// Registration, login, and password management routes.
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

// ---------------------------------------------------------------------------
// 1. REGISTRATION (CREATE ACCOUNT)
// ---------------------------------------------------------------------------
router.post("/api/register", async (request, response) => {
  try {
    const { email, password, role } = request.body || {};
    const fullName = request.body.full_name ?? request.body.fullName;
    const mobileNumber = request.body.mobile_number ?? request.body.mobileNumber ?? request.body.mobile;
    const confirmPassword = request.body.confirm_password ?? request.body.confirmPassword;
    const storeName = String(request.body.store_name ?? request.body.storeName ?? "").trim();

    const cleanedName = String(fullName || "").trim();
    const cleanedEmail = String(email || "").trim().toLowerCase();
    const cleanedMobile = String(mobileNumber || "").trim();
    const cleanedPassword = String(password || "");
    const cleanedConfirmPassword = String(confirmPassword || "");
    const cleanedRole = String(role || "buyer").trim().toLowerCase();

    // 1. Validate required fields
    if (!cleanedName || !cleanedEmail || !cleanedMobile || !cleanedPassword) {
      return response.status(400).json({
        message: "Full name, email address, mobile number, and password are required."
      });
    }

    if (cleanedName.length < 2) {
      return response.status(400).json({
        message: "Full name must be at least 2 characters."
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanedEmail)) {
      return response.status(400).json({
        message: "Please enter a valid email address."
      });
    }

    // Mobile number validation (10 to 15 digits)
    const mobileDigits = cleanedMobile.replace(/\D/g, "");
    if (mobileDigits.length < 10 || mobileDigits.length > 15) {
      return response.status(400).json({
        message: "Please enter a valid mobile number (10 to 15 digits)."
      });
    }

    // Confirm password match
    if (cleanedPassword !== cleanedConfirmPassword) {
      return response.status(400).json({
        message: "Password and Confirm Password must match."
      });
    }

    // Password length
    if (cleanedPassword.length < 6) {
      return response.status(400).json({
        message: "Password must contain at least 6 characters."
      });
    }

    // Role restrictions: Prevent users from self-registering as ADMIN
    if (cleanedRole === "admin") {
      return response.status(400).json({
        message: "Admin accounts cannot be created via public registration."
      });
    }

    if (!["buyer", "seller"].includes(cleanedRole)) {
      return response.status(400).json({
        message: "Invalid account type. Please select Buyer or Seller."
      });
    }

    if (cleanedRole === "seller" && !storeName) {
      return response.status(400).json({
        message: "Store name is required for seller accounts."
      });
    }

    // Check whether the email already exists
    const existingEmail = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [cleanedEmail]
    );

    if (existingEmail.rows.length > 0) {
      return response.status(409).json({
        message: "An account with this email address already exists."
      });
    }

    // Check whether the mobile number already exists
    const existingMobile = await pool.query(
      "SELECT id FROM users WHERE mobile_number = $1 LIMIT 1",
      [cleanedMobile]
    );

    if (existingMobile.rows.length > 0) {
      return response.status(409).json({
        message: "An account with this mobile number already exists."
      });
    }

    // Hash password with BCrypt
    const passwordHash = await bcrypt.hash(cleanedPassword, 10);

    // Save in PostgreSQL
    const userResult = await pool.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, mobile_number, role, created_at, updated_at`,
      [cleanedName, cleanedEmail, cleanedMobile, passwordHash, cleanedRole]
    );

    const user = userResult.rows[0];

    // Ensure corresponding role profile
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

    const safeUser = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      mobile_number: user.mobile_number,
      role: user.role
    };

    return response.status(201).json({
      message: "Account created successfully. Please sign in to continue.",
      user: safeUser
    });
  } catch (error) {
    console.error("Registration error:", error);
    if (error.code === "23505") {
      if (String(error.detail || error.message).includes("email")) {
        return response.status(409).json({ message: "An account with this email address already exists." });
      }
      if (String(error.detail || error.message).includes("mobile_number")) {
        return response.status(409).json({ message: "An account with this mobile number already exists." });
      }
    }
    return response.status(500).json({
      message: "Unable to create account right now. Please try again later."
    });
  }
});

// ---------------------------------------------------------------------------
// 2. LOGIN
// ---------------------------------------------------------------------------
router.post("/api/login", async (request, response) => {
  try {
    const { email, password, role } = request.body || {};
    const identifier = String(email || "").trim();
    const cleanedPassword = String(password || "");
    const cleanedRole = String(role || "").trim().toLowerCase();

    if (!identifier || !cleanedPassword || !["buyer", "seller", "admin"].includes(cleanedRole)) {
      return response.status(400).json({ message: "Enter a valid email address or mobile number, password, and account type." });
    }

    // Query user by email OR mobile number
    const result = await pool.query(
      `SELECT users.id, users.full_name, users.email, users.mobile_number, users.role,
              sellers.store_name,
              COALESCE(to_jsonb(users)->>'password_hash', to_jsonb(users)->>'password') AS password_hash
       FROM users
       LEFT JOIN sellers ON sellers.user_id = users.id
       WHERE LOWER(users.email) = LOWER($1) OR users.mobile_number = $1
       LIMIT 1`,
      [identifier]
    );

    const user = result.rows[0];

    // Check user existence, role matching (case-insensitive), and verify password with BCrypt
    if (
      !user ||
      user.role.toLowerCase() !== cleanedRole ||
      !user.password_hash ||
      !(await bcrypt.compare(cleanedPassword, user.password_hash))
    ) {
      return response.status(401).json({ message: "Incorrect email, password, or account type." });
    }

    const safeUser = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      mobile_number: user.mobile_number || "",
      role: user.role,
      store_name: user.store_name || ""
    };

    const token = createAuthToken(safeUser);

    return response.json({
      message: "Login successful.",
      user: safeUser,
      token
    });
  } catch (error) {
    console.error("Login error:", error);
    return response.status(500).json({ message: "Unable to sign in right now." });
  }
});

// ---------------------------------------------------------------------------
// 3. FORGOT PASSWORD / PASSWORD RESET
// ---------------------------------------------------------------------------
router.post("/api/forgot-password", async (request, response) => {
  try {
    const { email } = request.body || {};
    const mobileNumber = request.body.mobile_number ?? request.body.mobileNumber;
    const newPassword = request.body.new_password ?? request.body.newPassword;
    const confirmPassword = request.body.confirm_password ?? request.body.confirmPassword;

    const cleanedEmail = String(email || "").trim().toLowerCase();
    const cleanedMobile = String(mobileNumber || "").trim();
    const cleanedPassword = String(newPassword || "");
    const cleanedConfirm = String(confirmPassword || "");

    if (!cleanedEmail || !cleanedMobile || !cleanedPassword) {
      return response.status(400).json({
        message: "Email address, registered mobile number, and new password are required."
      });
    }

    if (cleanedPassword !== cleanedConfirm) {
      return response.status(400).json({
        message: "New password and Confirm password do not match."
      });
    }

    if (cleanedPassword.length < 6) {
      return response.status(400).json({
        message: "New password must contain at least 6 characters."
      });
    }

    // Verify account ownership with email and mobile
    const userResult = await pool.query(
      `SELECT id, full_name, email, mobile_number
       FROM users
       WHERE LOWER(email) = LOWER($1) AND (mobile_number = $2 OR mobile_number = $3)
       LIMIT 1`,
      [cleanedEmail, cleanedMobile, cleanedMobile.replace(/\D/g, "")]
    );

    const user = userResult.rows[0];
    if (!user) {
      return response.status(404).json({
        message: "No account found matching this email and mobile number combination."
      });
    }

    // Hash new password using BCrypt
    const newPasswordHash = await bcrypt.hash(cleanedPassword, 10);

    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newPasswordHash, user.id]
    );

    return response.json({
      message: "Password reset successfully. You can now sign in with your new password."
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return response.status(500).json({
      message: "Unable to reset password right now."
    });
  }
});

module.exports = router;
