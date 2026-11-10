// SIVA MART starts here: sets up Express, serves the website, and connects the API routes.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const cors = require("cors");
const express = require("express");
const multer = require("multer");
const { pool, databaseHostName } = require("./database");
const { getSchemaReady } = require("./schema");

const app = express();
const PORT = 3000;

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

app.use(require("./routes/accounts"));
app.use(require("./routes/products"));
app.use(require("./routes/cart"));
app.use(require("./routes/orders"));
app.use(require("./routes/admin"));

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    response.status(503).json({ status: "error", database: "disconnected" });
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

let server;

function startServer(retries = 10, delayMs = 300) {
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`SIVA_MART login server is running at http://0.0.0.0:${PORT}`);
    console.log(`Database host: ${databaseHostName()}`);
    getSchemaReady()
      .then(() => console.log("Database connected and schema is ready."))
      .catch((error) => {
        console.error(`Database is not ready: ${error.message || error.code}. API requests return 503 and retry until it is reachable.`);
      });
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && retries > 0) {
      console.warn(`Port ${PORT} in use, retrying in ${delayMs}ms (${retries} attempts left)...`);
      setTimeout(() => {
        try { server.close(); } catch {}
        startServer(retries - 1, delayMs);
      }, delayMs);
    } else {
      console.error(`Server failed to start on port ${PORT}: ${error.message}`);
      process.exit(1);
    }
  });
}

function shutdown() {
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

if (require.main === module) {
  startServer();
}

module.exports = app;
