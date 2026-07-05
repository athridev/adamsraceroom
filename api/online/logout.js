const { clearCreatorCookie, sendJson } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  clearCreatorCookie(response);
  return sendJson(response, 200, { ok: true });
};
