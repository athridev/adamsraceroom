const {
  activePath,
  deleteJson,
  getActiveRoom,
  publicRoom,
  requireCreator,
  roomPath,
  saveRoom,
  sendJson,
} = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const session = requireCreator(request, response);
  if (!session) return;

  const room = await getActiveRoom();
  if (!room) return sendJson(response, 200, { ok: true, room: null });

  room.status = "ended";
  room.endedAt = new Date().toISOString();
  room.resultReason = "creator-ended";
  await saveRoom(room);
  await deleteJson(activePath());
  await deleteJson(roomPath(room.code));

  return sendJson(response, 200, { ok: true, room: publicRoom(room) });
};
