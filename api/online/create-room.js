const {
  activePath,
  freshRoom,
  generateRoomCode,
  getActiveRoom,
  getRoom,
  parseJsonBody,
  publicRoom,
  putJson,
  requireCreator,
  saveRoom,
  sendJson,
  signPlayerToken,
} = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const session = requireCreator(request, response);
  if (!session) return;

  let body;
  try {
    body = await parseJsonBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message || "Invalid request." });
  }

  try {
    const active = await getActiveRoom();
    if (active) {
      return sendJson(response, 409, {
        error: "You already have an active Japan Drift session.",
        room: publicRoom(active),
        playerId: "p1",
        playerToken: signPlayerToken(active.code, "p1"),
      });
    }

    let code = generateRoomCode();
    for (let tries = 0; tries < 8 && (await getRoom(code)); tries++) code = generateRoomCode();

    const room = freshRoom(code, body.name || "Adam", body.car || "s15");
    await saveRoom(room);
    await putJson(activePath(), { code: room.code, creator: session.sub, createdAt: room.createdAt });

    return sendJson(response, 200, {
      ok: true,
      room: publicRoom(room),
      playerId: "p1",
      playerToken: signPlayerToken(room.code, "p1"),
    });
  } catch (error) {
    console.error("JAPAN_DRIFT_CREATE_ROOM_ERROR", error);
    return sendJson(response, 500, { error: "Could not create room.", detail: error.message });
  }
};
