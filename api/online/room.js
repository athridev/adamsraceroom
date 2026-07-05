const { getRoom, normalizeRoomCode, publicRoom, sendJson } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);
  const room = await getRoom(normalizeRoomCode(url.searchParams.get("code")));
  if (!room) return sendJson(response, 404, { error: "Session not found." });
  return sendJson(response, 200, { ok: true, room: publicRoom(room) });
};
