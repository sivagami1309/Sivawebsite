const fs = require("fs");
const http = require("http");
const path = require("path");

const FRONTEND_ROOT = path.resolve(__dirname, "..", "frontend");
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 5173);
const API_PORT = Number(process.env.API_PORT || process.env.PORT || 8080);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const server = http.createServer((request, response) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (parsedUrl.pathname === "/api" || parsedUrl.pathname.startsWith("/api/")) {
    const proxy = http.request({
      hostname: "::1",
      port: API_PORT,
      method: request.method,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: { ...request.headers, host: `localhost:${API_PORT}` }
    }, (upstream) => {
      response.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(response);
    });
    proxy.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Backend is unavailable. Start it on port 8080." }));
      }
    });
    request.pipe(proxy);
    return;
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch {
    response.writeHead(400);
    response.end("Invalid URL");
    return;
  }
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(FRONTEND_ROOT, `.${requestedPath}`);
  if (filePath !== FRONTEND_ROOT && !filePath.startsWith(`${FRONTEND_ROOT}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stats.size,
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") {
      response.end();
    } else {
      fs.createReadStream(filePath).pipe(response);
    }
  });
});

server.listen(FRONTEND_PORT, () => {
  console.log(`SIVA MART frontend: http://localhost:${FRONTEND_PORT} (API proxy to http://localhost:${API_PORT})`);
});
