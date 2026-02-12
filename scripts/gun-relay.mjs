/**
 * Simple local Gun relay server for development.
 * Run with: node scripts/gun-relay.mjs
 */
import { createRequire } from "module";
import http from "http";

const require = createRequire(import.meta.url);
const Gun = require("../packages/transport-gun/node_modules/gun");

const port = 8765;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Gun relay running");
});

// Attach Gun to the HTTP server
Gun({ web: server, file: "data/gun-dev" });

server.listen(port, () => {
  console.log(`Gun relay running at http://localhost:${port}/gun`);
  console.log("Add this peer to connect: ws://localhost:8765/gun");
});
