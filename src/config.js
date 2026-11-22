const path = require("node:path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

function numberFromEnv(name, fallback, min = 1) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`${name} must be a number greater than or equal to ${min}`);
  }
  return value;
}

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: numberFromEnv("PORT", 3000),
  databaseUrl: process.env.DATABASE_URL,
  apiKey: process.env.DISPATCH_API_KEY || "",
  reviewerApiKey: process.env.REVIEWER_API_KEY || "",
  allowPrivateDestinations: process.env.ALLOW_PRIVATE_DESTINATIONS === "true",
  workerPollIntervalMs: numberFromEnv("WORKER_POLL_INTERVAL_MS", 500),
  webhookTimeoutMs: numberFromEnv("WEBHOOK_TIMEOUT_MS", 10000),
  maxAttempts: numberFromEnv("MAX_ATTEMPTS", 4),
  retryBaseDelayMs: numberFromEnv("RETRY_BASE_DELAY_MS", 2000),
  rateLimitCapacity: numberFromEnv("RATE_LIMIT_CAPACITY", 5),
  rateLimitRefillPerSecond: numberFromEnv("RATE_LIMIT_REFILL_PER_SECOND", 1)
};

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and configure it.");
}
if (config.nodeEnv === "production" && !config.apiKey) {
  throw new Error("DISPATCH_API_KEY is required in production.");
}
module.exports = config;
