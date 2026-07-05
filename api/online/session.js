const { getActiveRoom, getCreatorSession, publicRoom, sendJson } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const session = getCreatorSession(request);
  if (!session) return sendJson(response, 401, { error: "Unauthorized." });
  const activeRoom = await getActiveRoom();

  return sendJson(response, 200, {
    ok: true,
    email: session.sub,
    expiresAt: new Date(session.exp * 1000).toISOString(),
    activeRoom: publicRoom(activeRoom),
  });
};
