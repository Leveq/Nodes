/**
 * Gun relay server for production deployment.
 * Supports Railway, Fly.io, Render, etc.
 */
import http from "http";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Gun = require("gun");

// Use PORT from environment (Railway, Render, etc.) or default
const port = process.env.PORT || 8765;

const server = http.createServer((req, res) => {
  // CORS headers for web clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      status: "ok", 
      service: "gun-relay",
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Gun handles WebSocket upgrade for /gun path
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Gun relay running");
});

// Initialize Gun with the HTTP server
Gun({ 
  web: server, 
  file: process.env.DATA_DIR || "data/gun-relay",
  // Performance tuning for production
  axe: false, // Disable AXE (advanced exchange) for simpler operation
});

server.listen(port, () => {
  console.log(`[Gun Relay] Running on port ${port}`);
  console.log(`[Gun Relay] WebSocket endpoint: ws://localhost:${port}/gun`);
  console.log(`[Gun Relay] Health check: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Gun Relay] Shutting down...");
  server.close(() => {
    console.log("[Gun Relay] Closed");
    process.exit(0);
  });
});
