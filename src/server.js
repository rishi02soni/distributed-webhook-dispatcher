const app = require("./app");
const config = require("./config");
const { closePool } = require("./db");

const server = app.listen(config.port, () => {
  console.log(`[api] Listening on port ${config.port}`);
});

async function shutdown(signal) {
  console.log(`[api] ${signal} received; shutting down...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
