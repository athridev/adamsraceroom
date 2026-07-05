const {
  getRoom,
  normalizeRoomCode,
  parseJsonBody,
  publicRoom,
  saveRoom,
  sendJson,
  signPlayerToken,
} = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  let body;
  try {
    body = await parseJsonBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message || "Invalid request." });
  }

  const code = normalizeRoomCode(body.code);
  if (!code) return sendJson(response, 400, { error: "Enter a session code." });

  try {
    const room = await getRoom(code);
    if (!room || room.status === "ended") return sendJson(response, 404, { error: "Session not found." });
    if (room.players.length >= 2 && !room.players.find((player) => player.id === body.playerId)) {
      return sendJson(response, 409, { error: "This 1v1 room is full." });
    }

    let playerId = "p2";
    const existing = room.players.find((player) => player.id === body.playerId);
    if (existing) {
      playerId = existing.id;
      existing.name = String(body.name || existing.name).trim().slice(0, 20) || existing.name;
      existing.car = String(body.car || existing.car).slice(0, 20);
    } else if (!room.players.find((player) => player.id === "p2")) {
      room.players.push({
        id: "p2",
        role: "guest",
        name: String(body.name || "Challenger").trim().slice(0, 20) || "Challenger",
        car: String(body.car || "fd").slice(0, 20),
        connected: false,
        ready: false,
        score: 0,
        progress: 0,
      });
    }

    await saveRoom(room);
    return sendJson(response, 200, {
      ok: true,
      room: publicRoom(room),
      playerId,
      playerToken: signPlayerToken(room.code, playerId),
    });
  } catch (error) {
    console.error("JAPAN_DRIFT_JOIN_ROOM_ERROR", error);
    return sendJson(response, 500, { error: "Could not join room.", detail: error.message });
  }
};
