// Login tokens and the role checks used by the routes.
const crypto = require("crypto");
const { pool } = require("./database");

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

async function getUserProfile(userId) {
  const result = await pool.query(
    `SELECT users.id, users.full_name, users.email, users.role, sellers.store_name
     FROM users LEFT JOIN sellers ON sellers.user_id = users.id
     WHERE users.id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
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

module.exports = { createAuthToken, requireUser, optionalUser, requireAdmin };
