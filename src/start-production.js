
const { spawn } = require("node:child_process");

const processes = [];
let shuttingDown = false;

function shutdown(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[startup] Shutting down (${signal})`);

  for (const child of processes) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(1), 12000).unref();
}

function start(name, file) {
  const child = spawn(process.execPath, [file], {
    stdio: "inherit",
    env: process.env
  });

  processes.push(child);

  child.on("error", (error) => {
    console.error(`[startup] ${name} error:`, error);
    shutdown();
  });

  child.on("exit", (code, signal) => {
    console.log(
      `[startup] ${name} exited: code=${code}, signal=${signal}`
    );

    if (!shuttingDown) {
      shutdown();
    }

    if (processes.every(
      (p) => p.exitCode !== null || p.signalCode !== null
    )) {
      process.exit(shuttingDown ? 0 : 1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start("api", "src/server.js");
start("worker", "src/worker.js");
