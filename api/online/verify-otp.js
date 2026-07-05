const {
  ALLOWED_CREATOR_EMAIL,
  normalizeEmail,
  parseJsonBody,
  sendJson,
  setCreatorCookie,
  verifyOtpChallenge,
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

  const email = normalizeEmail(body.email);
  if (email !== ALLOWED_CREATOR_EMAIL) {
    return sendJson(response, 403, { error: "This email is not allowed." });
  }

  try {
    const valid = await verifyOtpChallenge(body.challengeId, body.code);
    if (!valid) return sendJson(response, 401, { error: "Invalid or expired code." });
    setCreatorCookie(request, response, email);
    return sendJson(response, 200, { ok: true, email });
  } catch (error) {
    console.error("JAPAN_DRIFT_OTP_VERIFY_ERROR", error);
    return sendJson(response, 500, { error: "OTP verification failed.", detail: error.message });
  }
};
