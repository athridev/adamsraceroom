const crypto = require("node:crypto");

const ALLOWED_CREATOR_EMAIL = "adamjaljoly@gmail.com";
const CREATOR_COOKIE = "jdo_creator_session";
const OTP_TTL_SECONDS = 60 * 10;
const SESSION_TTL_SECONDS = 60 * 60 * 6;
const ROOM_TTL_SECONDS = 60 * 60 * 3;
const MAX_JSON_BODY = 25000;
const MAX_OTP_ATTEMPTS = 5;
const ROOM_PREFIX = "japandrift-online/";

function getHeader(request, name) {
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function setJsonHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function sendJson(response, status, payload) {
  setJsonHeaders(response);
  return response.status(status).json(payload);
}

async function parseJsonBody(request) {
  const contentLength = Number(getHeader(request, "content-length") || 0);
  if (contentLength > MAX_JSON_BODY) {
    const error = new Error("Request body is too large.");
    error.status = 413;
    throw error;
  }

  const contentType = String(getHeader(request, "content-type"));
  if (!contentType.includes("application/json")) {
    const error = new Error("Send JSON.");
    error.status = 415;
    throw error;
  }

  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return request.body || {};
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function appSecret() {
  const value =
    process.env.JAPANDRIFT_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.CRON_SECRET;
  if (!value) throw new Error("JAPANDRIFT_SESSION_SECRET is not configured.");
  return value;
}

function hmac(value, secret = appSecret()) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function signToken(payload) {
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${hmac(encoded)}`;
}

function verifyToken(token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature || !safeEqual(hmac(encoded), signature)) return null;
  const payload = JSON.parse(fromBase64url(encoded));
  if (!payload.exp || Date.now() > payload.exp * 1000) return null;
  return payload;
}

function parseCookies(request) {
  return Object.fromEntries(
    String(getHeader(request, "cookie"))
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function isLocalRequest(request) {
  const host = String(getHeader(request, "host"));
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function setCreatorCookie(request, response, email) {
  const now = Math.floor(Date.now() / 1000);
  const token = signToken({
    sub: email,
    role: "creator",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });
  const secure = isLocalRequest(request) ? "" : " Secure;";
  response.setHeader(
    "Set-Cookie",
    `${CREATOR_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`,
  );
}

function clearCreatorCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${CREATOR_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
}

function getCreatorSession(request) {
  const cookies = parseCookies(request);
  const session = verifyToken(cookies[CREATOR_COOKIE]);
  if (!session || session.role !== "creator" || session.sub !== ALLOWED_CREATOR_EMAIL) return null;
  return session;
}

function requireCreator(request, response) {
  const session = getCreatorSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Creator verification required." });
    return null;
  }
  return session;
}

function signPlayerToken(code, playerId) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    room: normalizeRoomCode(code),
    playerId,
    role: "player",
    iat: now,
    exp: now + ROOM_TTL_SECONDS,
  });
}

function verifyPlayerToken(token, code, playerId) {
  const payload = verifyToken(token);
  if (!payload || payload.role !== "player") return null;
  if (normalizeRoomCode(payload.room) !== normalizeRoomCode(code)) return null;
  if (payload.playerId !== playerId) return null;
  return payload;
}

function localStore() {
  if (!globalThis.__JAPAN_DRIFT_ONLINE_STORE__) {
    globalThis.__JAPAN_DRIFT_ONLINE_STORE__ = new Map();
  }
  return globalThis.__JAPAN_DRIFT_ONLINE_STORE__;
}

async function putJson(pathname, payload) {
  const body = JSON.stringify(payload);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    localStore().set(pathname, body);
    return;
  }
  const { put } = await import("@vercel/blob");
  await put(pathname, body, {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function getJson(pathname) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const raw = localStore().get(pathname);
    return raw ? JSON.parse(raw) : null;
  }
  const { get } = await import("@vercel/blob");
  const stored = await get(pathname, { access: "private" });
  if (stored?.statusCode !== 200 || !stored.stream) return null;
  return JSON.parse(await new Response(stored.stream).text());
}

async function deleteJson(pathname) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    localStore().delete(pathname);
    return;
  }
  const { del } = await import("@vercel/blob");
  await del(pathname);
}

function roomPath(code) {
  return `${ROOM_PREFIX}rooms/${normalizeRoomCode(code)}.json`;
}

function activePath() {
  return `${ROOM_PREFIX}active-creator.json`;
}

function challengePath(challengeId) {
  return `${ROOM_PREFIX}otp/${challengeId}.json`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRoomCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(0, alphabet.length)];
  return code;
}

function otpHash(challengeId, code) {
  return hmac(`${challengeId}:${code}`);
}

async function createOtpChallenge(email) {
  const challengeId = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
  await putJson(challengePath(challengeId), {
    challengeId,
    email,
    hash: otpHash(challengeId, code),
    attempts: 0,
    expiresAt,
    createdAt: new Date().toISOString(),
  });
  return { challengeId, code, expiresAt };
}

async function verifyOtpChallenge(challengeId, code) {
  const pathname = challengePath(challengeId);
  const challenge = await getJson(pathname);
  if (!challenge) return false;
  if (Date.now() > Date.parse(challenge.expiresAt)) {
    await deleteJson(pathname);
    return false;
  }
  if (Number(challenge.attempts || 0) >= MAX_OTP_ATTEMPTS) {
    await deleteJson(pathname);
    return false;
  }
  const valid = safeEqual(otpHash(challengeId, String(code || "")), challenge.hash);
  if (!valid) {
    await putJson(pathname, { ...challenge, attempts: Number(challenge.attempts || 0) + 1 });
    return false;
  }
  await deleteJson(pathname);
  return challenge.email === ALLOWED_CREATOR_EMAIL;
}

async function sendOtpEmail(code) {
  const from =
    process.env.JAPANDRIFT_EMAIL_FROM ||
    process.env.ADMIN_EMAIL_FROM ||
    process.env.LEAD_REPORT_FROM ||
    "Japan Drift <onboarding@resend.dev>";

  if (!process.env.RESEND_API_KEY) {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured.");
    }
    console.log(`JAPAN_DRIFT_DEV_OTP ${code}`);
    return { devCode: code };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [ALLOWED_CREATOR_EMAIL],
      subject: "Japan Drift Online creator code",
      text: `Your Japan Drift Online creator code is ${code}. It expires in 10 minutes.`,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend failed with status ${response.status}: ${details}`);
  }
  return {};
}

function publicRoom(room) {
  if (!room) return null;
  return {
    code: room.code,
    status: room.status,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    countdownAt: room.countdownAt || null,
    startedAt: room.startedAt || null,
    endedAt: room.endedAt || null,
    raceDurationMs: room.raceDurationMs,
    winnerId: room.winnerId || null,
    resultReason: room.resultReason || "",
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      car: player.car,
      role: player.role,
      connected: Boolean(player.connected),
      ready: Boolean(player.ready),
      score: Number(player.score || 0),
      progress: Number(player.progress || 0),
      finishedAt: player.finishedAt || null,
      lastSeen: player.lastSeen || null,
    })),
  };
}

function freshRoom(code, hostName, hostCar) {
  const now = Date.now();
  return {
    code,
    status: "lobby",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ROOM_TTL_SECONDS * 1000).toISOString(),
    raceDurationMs: 120000,
    players: [
      {
        id: "p1",
        role: "host",
        name: String(hostName || "Host").trim().slice(0, 20) || "Host",
        car: String(hostCar || "s15").slice(0, 20),
        connected: false,
        ready: false,
        score: 0,
        progress: 0,
      },
    ],
    events: [],
  };
}

async function getRoom(code) {
  const room = await getJson(roomPath(code));
  if (!room) return null;
  if (Date.now() > Date.parse(room.expiresAt)) {
    await deleteJson(roomPath(code));
    const active = await getJson(activePath());
    if (active?.code === room.code) await deleteJson(activePath());
    return null;
  }
  return room;
}

async function saveRoom(room) {
  room.updatedAt = new Date().toISOString();
  await putJson(roomPath(room.code), room);
}

async function getActiveRoom() {
  const active = await getJson(activePath());
  if (!active?.code) return null;
  const room = await getRoom(active.code);
  if (!room || room.status === "ended") {
    await deleteJson(activePath());
    return null;
  }
  return room;
}

module.exports = {
  ALLOWED_CREATOR_EMAIL,
  clearCreatorCookie,
  createOtpChallenge,
  deleteJson,
  freshRoom,
  generateRoomCode,
  getActiveRoom,
  getCreatorSession,
  getHeader,
  getJson,
  getRoom,
  normalizeEmail,
  normalizeRoomCode,
  parseJsonBody,
  publicRoom,
  putJson,
  requireCreator,
  roomPath,
  activePath,
  saveRoom,
  sendJson,
  sendOtpEmail,
  setCreatorCookie,
  signPlayerToken,
  verifyOtpChallenge,
  verifyPlayerToken,
};
