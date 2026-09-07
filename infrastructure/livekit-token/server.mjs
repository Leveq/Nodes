import { createServer } from "node:http";
import { AccessToken } from "livekit-server-sdk";
import SEA from "gun/sea.js";

/**
 * Nodes LiveKit token endpoint.
 *
 * Mints short-lived, room- and identity-scoped LiveKit access tokens WITHOUT
 * distributing the LiveKit API secret to clients. The caller proves it controls
 * the claimed SEA public key by signing a fresh {room, nodeId, ts} claim with
 * its private key; we verify the signature server-side and mint a token whose
 * `identity` is that public key. This prevents a member from impersonating
 * another identity in a voice room.
 *
 * It intentionally does NOT verify Node membership (the Gun graph is world-
 * readable and there is no server-side authz today); that is a future hardening
 * step. The security property provided here is: you can only get a token for an
 * identity you can sign for, scoped to the room you asked for, valid briefly.
 */

const {
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  LIVEKIT_URL,
  PORT = "8790",
  TOKEN_TTL = "2h",
  MAX_SKEW_MS = "60000",
  ALLOWED_ORIGIN = "*",
} = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  console.error(
    "[token] Missing required env: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL"
  );
  process.exit(1);
}

const maxSkewMs = Number(MAX_SKEW_MS) || 60_000;
const MAX_BODY_BYTES = 16 * 1024;

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true });
  }
  if (req.method !== "POST" || !req.url.startsWith("/token")) {
    return send(res, 404, { error: "not found" });
  }

  try {
    const raw = await readBody(req);
    const { pub, sig } = JSON.parse(raw || "{}");
    if (typeof pub !== "string" || !pub || typeof sig !== "string" || !sig) {
      return send(res, 400, { error: "pub and sig are required" });
    }

    // Verify the SEA signature proves ownership of `pub`. SEA.verify returns the
    // original signed payload (the JSON string we signed on the client) or a
    // falsy value if the signature does not match the public key.
    const verified = await SEA.verify(sig, pub);
    if (!verified) return send(res, 401, { error: "invalid signature" });

    let claim;
    try {
      claim = typeof verified === "string" ? JSON.parse(verified) : verified;
    } catch {
      return send(res, 400, { error: "malformed claim" });
    }

    const { room, ts } = claim || {};
    if (typeof room !== "string" || !room || typeof ts !== "number") {
      return send(res, 400, { error: "claim must include room and ts" });
    }
    // Reject stale/replayed requests.
    if (Math.abs(Date.now() - ts) > maxSkewMs) {
      return send(res, 401, { error: "stale request" });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: pub,
      ttl: TOKEN_TTL,
    });
    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });
    const token = await at.toJwt();

    return send(res, 200, { token, url: LIVEKIT_URL });
  } catch (err) {
    console.error("[token] error:", err instanceof Error ? err.message : err);
    return send(res, 500, { error: "token generation failed" });
  }
});

server.listen(Number(PORT), () => {
  console.log(`[token] listening on :${PORT} (LiveKit=${LIVEKIT_URL})`);
});
