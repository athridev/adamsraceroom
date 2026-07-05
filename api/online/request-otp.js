const {
  ALLOWED_CREATOR_EMAIL,
  createOtpChallenge,
  normalizeEmail,
  parseJsonBody,
  sendJson,
  sendOtpEmail,
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
    return sendJson(response, 403, { error: "This email is not allowed to create Japan Drift rooms." });
  }

  try {
    const challenge = await createOtpChallenge(email);
    const mail = await sendOtpEmail(challenge.code);
    return sendJson(response, 200, {
      ok: true,
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      sentTo: email.replace(/^(.).+(@.+)$/, "$1***$2"),
      devCode: mail.devCode,
    });
  } catch (error) {
    console.error("JAPAN_DRIFT_OTP_REQUEST_ERROR", error);
    return sendJson(response, 500, { error: "OTP email is not configured.", detail: error.message });
  }
};
