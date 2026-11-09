// The single PostgreSQL connection pool used by the whole app.
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;

function databaseHostName() {
  if (!databaseUrl) return process.env.PGHOST || "localhost";
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "invalid DATABASE_URL";
  }
}

function databaseSslOption() {
  if (!databaseUrl || process.env.DATABASE_SSL === "false") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(databaseHostName()) ? false : { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: databaseUrl || undefined,
  host: databaseUrl ? undefined : (process.env.PGHOST || "localhost"),
  port: databaseUrl ? undefined : Number(process.env.PGPORT || 5432),
  database: databaseUrl ? undefined : (process.env.PGDATABASE || "siva_mart"),
  user: databaseUrl ? undefined : process.env.PGUSER,
  password: databaseUrl ? undefined : process.env.PGPASSWORD,
  ssl: databaseSslOption()
});

module.exports = { pool, databaseHostName };
