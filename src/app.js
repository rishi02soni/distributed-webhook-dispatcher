const express = require("express");
const helmet = require("helmet");
const { query } = require("./db");
const { validateDestinationUrl, validatePayload } = require("./validation");
const { authenticate } = require("./auth");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "256kb", strict: true }));

app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.status(200).json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "unavailable", database: "disconnected" });
  }
});

app.post("/api/webhooks/dispatch", authenticate, async (req, res, next) => {
  try {
    const { destinationUrl, eventId, payload } = req.body || {};
    const destination = await validateDestinationUrl(destinationUrl);
    const validated = validatePayload({ eventId, payload });

    const result = await query(
      `INSERT INTO webhook_jobs
        (destination_url, destination_domain, event_id, payload, status, attempts, available_at)
       VALUES ($1, $2, $3, $4::jsonb, 'queued', 0, NOW())
       RETURNING id, status, created_at`,
      [destination.toString(), destination.hostname.toLowerCase(), validated.eventId, JSON.stringify(validated.payload)]
    );

    return res.status(202).json({
      status: "queued",
      jobId: result.rows[0].id,
      eventId: validated.eventId,
      createdAt: result.rows[0].created_at
    });
  } catch (error) {
    if (error.message && (
      error.message.includes("destinationUrl") ||
      error.message.includes("eventId") ||
      error.message.includes("payload") ||
      error.message.includes("Request body")
    )) {
      return res.status(400).json({ error: "Bad Request", message: error.message });
    }
    next(error);
  }
});

app.get("/api/webhooks/jobs/:jobId", authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, destination_url, event_id, status, attempts, last_response_code,
              last_error, created_at, updated_at, delivered_at
       FROM webhook_jobs WHERE id = $1`,
      [req.params.jobId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Job not found" });

    const attempts = await query(
      `SELECT attempt_number, status, response_code, error_message, duration_ms, created_at
       FROM webhook_delivery_attempts WHERE job_id = $1 ORDER BY attempt_number ASC`,
      [req.params.jobId]
    );

    res.json({ job: result.rows[0], deliveryAttempts: attempts.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/webhooks/jobs/:jobId/attempts", authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT attempt_number, status, response_code, error_message, duration_ms, created_at
       FROM webhook_delivery_attempts WHERE job_id = $1 ORDER BY attempt_number ASC`,
      [req.params.jobId]
    );
    res.json({ attempts: result.rows });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error("[api] Request error:", error);
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Bad Request", message: "Malformed JSON body" });
  }
  res.status(500).json({ error: "Internal Server Error" });
});

module.exports = app;
