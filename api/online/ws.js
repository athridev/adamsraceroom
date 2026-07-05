const http = require("node:http");
const { WebSocketServer } = require("ws");
const {
  getRoom,
  publicRoom,
  saveRoom,
  verifyPlayerToken,
} = require("./_lib");

const liveRooms = globalThis.__JAPAN_DRIFT_ONLINE_LIVE__ || new Map();
globalThis.__JAPAN_DRIFT_ONLINE_LIVE__ = liveRooms;

function safeSend(socket, payload) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function liveRoom(code) {
  const key = String(code).toUpperCase();
  if (!liveRooms.has(key)) {
    liveRooms.set(key, {
      code: key,
      sockets: new Map(),
      snapshots: new Map(),
      scores: new Map(),
      ready: new Set(),
      countdownAt: 0,
      startedAt: 0,
      ended: false,
    });
  }
  return liveRooms.get(key);
}

function broadcast(live, payload, exceptPlayerId = "") {
  for (const [playerId, socket] of live.sockets.entries()) {
    if (playerId === exceptPlayerId) continue;
    safeSend(socket, payload);
  }
}

function winnerFrom(room, live, reason) {
  const players = room.players.map((player) => {
    const score = live.scores.get(player.id) || {};
    return {
      id: player.id,
      name: player.name,
      car: player.car,
      score: Number(score.score || player.score || 0),
      progress: Number(score.progress || player.progress || 0),
      finishedAt: score.finishedAt || player.finishedAt || null,
    };
  });

  players.sort((a, b) => {
    const perfA = a.score + a.progress * 20000 + (a.finishedAt ? 50000 : 0);
    const perfB = b.score + b.progress * 20000 + (b.finishedAt ? 50000 : 0);
    if (perfA !== perfB) return perfB - perfA;
    return String(a.finishedAt || "9999").localeCompare(String(b.finishedAt || "9999"));
  });

  return {
    reason,
    winnerId: players[0]?.id || null,
    players,
  };
}

async function persistPresence(room, live) {
  const now = new Date().toISOString();
  for (const player of room.players) {
    player.connected = live.sockets.has(player.id);
    if (player.connected) player.lastSeen = now;
    if (live.ready.has(player.id)) player.ready = true;
    const score = live.scores.get(player.id);
    if (score) {
      player.score = Number(score.score || 0);
      player.progress = Number(score.progress || 0);
      player.finishedAt = score.finishedAt || null;
    }
  }
  await saveRoom(room).catch((error) => console.error("JDO_PERSIST_ERROR", error));
}

const server = http.createServer((request, response) => {
  response.writeHead(426, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Use a WebSocket connection." }));
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (socket, request) => {
  const url = new URL(request.url, "https://japandrift.local");
  const code = String(url.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const playerId = String(url.searchParams.get("playerId") || "");
  const token = String(url.searchParams.get("token") || "");

  if (!code || !playerId || !verifyPlayerToken(token, code, playerId)) {
    safeSend(socket, { type: "error", error: "Invalid realtime token." });
    socket.close(1008, "invalid-token");
    return;
  }

  const room = await getRoom(code);
  if (!room || !room.players.find((player) => player.id === playerId)) {
    safeSend(socket, { type: "error", error: "Room not found." });
    socket.close(1008, "room-not-found");
    return;
  }

  const live = liveRoom(code);
  const existing = live.sockets.get(playerId);
  if (existing && existing.readyState === existing.OPEN) existing.close(1000, "replaced");
  live.sockets.set(playerId, socket);

  await persistPresence(room, live);
  safeSend(socket, {
    type: "hello",
    serverTime: Date.now(),
    playerId,
    room: publicRoom(room),
  });
  broadcast(live, {
    type: "presence",
    playerId,
    connected: true,
    players: publicRoom(room).players,
  });

  socket.on("message", async (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "ping") {
      safeSend(socket, { type: "pong", serverTime: Date.now(), clientTime: message.clientTime || 0 });
      return;
    }

    if (message.type === "ready") {
      live.ready.add(playerId);
      await persistPresence(room, live);
      broadcast(live, { type: "ready", playerId, players: publicRoom(room).players });

      if (room.players.length === 2 && room.players.every((player) => live.ready.has(player.id)) && !live.countdownAt) {
        live.countdownAt = Date.now() + 3800;
        live.startedAt = live.countdownAt;
        room.status = "countdown";
        room.countdownAt = new Date(live.countdownAt).toISOString();
        room.startedAt = new Date(live.startedAt).toISOString();
        await saveRoom(room);
        broadcast(live, {
          type: "countdown",
          countdownAt: live.countdownAt,
          startedAt: live.startedAt,
          room: publicRoom(room),
        });
      }
      return;
    }

    if (message.type === "state") {
      const state = message.state || {};
      live.snapshots.set(playerId, {
        t: Date.now(),
        x: Number(state.x || 0),
        y: Number(state.y || 0),
        h: Number(state.h || 0),
        vx: Number(state.vx || 0),
        vy: Number(state.vy || 0),
        speed: Number(state.speed || 0),
        gear: Number(state.gear || 1),
        rpm: Number(state.rpm || 0),
        drifting: Boolean(state.drifting),
        score: Number(state.score || 0),
        progress: Number(state.progress || 0),
      });
      broadcast(live, { type: "state", playerId, serverTime: Date.now(), state: live.snapshots.get(playerId) }, playerId);
      return;
    }

    if (message.type === "score") {
      live.scores.set(playerId, {
        score: Number(message.score || 0),
        progress: Number(message.progress || 0),
        finishedAt: message.finishedAt || null,
      });
      broadcast(live, { type: "score", playerId, score: live.scores.get(playerId) });
      return;
    }

    if (message.type === "finish" && !live.ended) {
      const score = live.scores.get(playerId) || {};
      live.scores.set(playerId, {
        ...score,
        score: Number(message.score || score.score || 0),
        progress: Number(message.progress || score.progress || 1),
        finishedAt: new Date().toISOString(),
      });

      const allFinished = room.players.every((player) => live.scores.get(player.id)?.finishedAt);
      const timedOut = Number(message.remainingMs || 1) <= 0;
      if (allFinished || timedOut) {
        live.ended = true;
        room.status = "ended";
        room.endedAt = new Date().toISOString();
        const result = winnerFrom(room, live, timedOut ? "timer" : "finish");
        room.winnerId = result.winnerId;
        room.resultReason = result.reason;
        await persistPresence(room, live);
        broadcast(live, { type: "results", result, room: publicRoom(room) });
      } else {
        broadcast(live, { type: "player-finished", playerId, score: live.scores.get(playerId) });
      }
    }
  });

  socket.on("close", async () => {
    const current = live.sockets.get(playerId);
    if (current === socket) live.sockets.delete(playerId);
    const latestRoom = await getRoom(code);
    if (latestRoom) {
      await persistPresence(latestRoom, live);
      broadcast(live, {
        type: "presence",
        playerId,
        connected: false,
        players: publicRoom(latestRoom).players,
      });
    }
  });
});

module.exports = server;
