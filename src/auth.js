const config = require("./config");

function authenticate(req, res, next) {
  if (!config.apiKey && config.nodeEnv !== "production") return next();

  const header = req.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied || supplied !== config.apiKey) {
    return res.status(401).json({ error: "Unauthorized", message: "A valid Bearer API key is required." });
  }
  next();
}

module.exports = { authenticate };
