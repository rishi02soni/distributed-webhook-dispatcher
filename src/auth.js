
const crypto = require("node:crypto");
const config = require("./config");

function matchesKey(supplied, expected) {
  if (!supplied || !expected) return false;

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authenticate(req, res, next) {
  if (!config.apiKey && config.nodeEnv !== "production") {
    return next();
  }

  const header = req.get("authorization") || "";
  const supplied = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  const valid =
    matchesKey(supplied, config.apiKey) ||
    matchesKey(supplied, config.reviewerApiKey);

  if (!valid) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "A valid Bearer API key is required."
    });
  }

  next();
}

module.exports = { authenticate };
