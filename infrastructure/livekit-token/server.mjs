import { createServer } from "node:http";
import { AccessToken, RoomServiceClient, TrackType } from "livekit-server-sdk";
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
  // HTTP base URL of the LiveKit server for the server-side RoomServiceClient
  // (presence). Distinct from LIVEKIT_URL (the public wss:// clients connect to)
  // because the token service reaches LiveKit over the internal network, e.g.
  // http://host.docker.internal:7880. If unset, /presence is disabled.
  LIVEKIT_HOST,
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

// Server-side client for querying live room occupancy (presence). Only created
// when LIVEKIT_HOST is configured; otherwise /presence returns 501.
const roomService = LIVEKIT_HOST
  ? new RoomServiceClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
  : null;

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

/**
 * Verify a signed request body `{ pub, sig }`. Returns `{ ok, claim }` on
 * success or `{ ok: false, status, error }` on failure. The client signs a JSON
 * claim `{ room, ts, ... }` with its SEA private key; we verify the signature
 * proves ownership of `pub` and that the request is fresh (anti-replay).
 */
async function verifySignedRequest(raw) {
  const { pub, sig } = JSON.parse(raw || "{}");
  if (typeof pub !== "string" || !pub || typeof sig !== "string" || !sig) {
    return { ok: false, status: 400, error: "pub and sig are required" };
  }
  const verified = await SEA.verify(sig, pub);
  if (!verified) return { ok: false, status: 401, error: "invalid signature" };

  let claim;
  try {
    claim = typeof verified === "string" ? JSON.parse(verified) : verified;
  } catch {
    return { ok: false, status: 400, error: "malformed claim" };
  }
  const { room, ts } = claim || {};
  if (typeof room !== "string" || !room || typeof ts !== "number") {
    return { ok: false, status: 400, error: "claim must include room and ts" };
  }
  if (Math.abs(Date.now() - ts) > maxSkewMs) {
    return { ok: false, status: 401, error: "stale request" };
  }
  return { ok: true, pub, claim };
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true });
  }
  if (req.method !== "POST") {
    return send(res, 404, { error: "not found" });
  }

  const isToken = req.url.startsWith("/token");
  const isPresence = req.url.startsWith("/presence");
  if (!isToken && !isPresence) {
    return send(res, 404, { error: "not found" });
  }

  try {
    const raw = await readBody(req);
    const verified = await verifySignedRequest(raw);
    if (!verified.ok) return send(res, verified.status, { error: verified.error });
    const { pub, claim } = verified;
    const { room } = claim;

    if (isPresence) {
      if (!roomService) {
        return send(res, 501, { error: "presence not configured" });
      }
      let participants = [];
      try {
        const infos = await roomService.listParticipants(room);
        participants = infos.map((p) => {
          const audioTracks = (p.tracks || []).filter(
            (t) => t.type === TrackType.AUDIO
          );
          // Muted only if they publish audio and every audio track is muted.
          const muted =
            audioTracks.length > 0 && audioTracks.every((t) => t.muted);
          return { pub: p.identity, muted };
        });
      } catch {
        // LiveKit throws if the room doesn't exist yet (nobody has joined).
        participants = [];
      }
      return send(res, 200, { participants });
    }

    // Mint an identity- and room-scoped LiveKit access token.
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
    return send(res, 500, { error: "request failed" });
  }
});

server.listen(Number(PORT), () => {
  console.log(
    `[token] listening on :${PORT} (LiveKit=${LIVEKIT_URL}, presence=${
      roomService ? "on" : "off"
    })`
  );
});
