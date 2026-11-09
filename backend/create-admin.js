// Creates an admin account, because admins cannot sign up from the website.
// Usage: npm run create-admin -- admin@example.com "a strong password" "Full Name"
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "siva_mart",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD
});

async function createAdmin() {
  const [email, password, fullName = "Siva Mart Admin"] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('Usage: npm run create-admin -- admin@example.com "password of 8+ characters" "Full Name"');
    process.exitCode = 1;
    return;
  }

  const existing = await pool.query("SELECT role FROM users WHERE LOWER(email) = LOWER($1)", [email]);
  if (existing.rows[0]) {
    console.log(`An account with this email already exists (role: ${existing.rows[0].role}). Nothing was changed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
    [fullName, email.toLowerCase(), passwordHash]
  );
  console.log(`Admin account created for ${email}.`);
}

createAdmin()
  .catch((error) => {
    console.error("Could not create the admin:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
