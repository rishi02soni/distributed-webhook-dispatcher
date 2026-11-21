const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.nodeEnv === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on("error", (error) => {
  console.error("[db] Unexpected idle client error:", error);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, closePool };
