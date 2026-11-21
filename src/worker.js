
const { pool, closePool } = require("./db");
const config = require("./config");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function claimJob() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT id, destination_url, destination_domain,
              event_id, payload, attempts
       FROM webhook_jobs
       WHERE (status IN ('queued', 'retrying')
              AND available_at <= NOW())
          OR (status = 'processing'
              AND processing_started_at <
                  NOW() - INTERVAL '1 minute')
       ORDER BY available_at ASC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );

    if (!result.rowCount) {
      await client.query("COMMIT");
      return null;
    }

    const job = result.rows[0];

    await client.query(
      `UPDATE webhook_jobs
       SET status = 'processing',
           processing_started_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [job.id]
    );

    await client.query("COMMIT");
    return job;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function acquireDomainToken(domain) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO domain_rate_limits
         (domain, tokens, last_refill_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (domain) DO NOTHING`,
      [domain, config.rateLimitCapacity]
    );

    const locked = await client.query(
      `SELECT domain, tokens, last_refill_at
       FROM domain_rate_limits
       WHERE domain = $1
       FOR UPDATE`,
      [domain]
    );

    const now = Date.now();
    const capacity = config.rateLimitCapacity;
    const refillRate = config.rateLimitRefillPerSecond;

    const row = locked.rows[0];

    const elapsedSeconds = Math.max(
      0,
      (now - new Date(row.last_refill_at).getTime()) / 1000
    );

    const available = Math.min(
      capacity,
      Number(row.tokens) + elapsedSeconds * refillRate
    );

    if (available >= 1) {
      await client.query(
        `UPDATE domain_rate_limits
         SET tokens = $2,
             last_refill_at = NOW()
         WHERE domain = $1`,
        [domain, available - 1]
      );

      await client.query("COMMIT");
      return { allowed: true, waitMs: 0 };
    }

    const waitMs = Math.ceil(
      ((1 - available) / refillRate) * 1000
    );

    await client.query(
      `UPDATE domain_rate_limits
       SET tokens = $2,
           last_refill_at = NOW()
       WHERE domain = $1`,
      [domain, available]
    );

    await client.query("COMMIT");
    return { allowed: false, waitMs };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deferForRateLimit(jobId, waitMs) {
  await pool.query(
    `UPDATE webhook_jobs
     SET status = 'queued',
         available_at =
           NOW() + ($2::bigint * INTERVAL '1 millisecond'),
         processing_started_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, waitMs]
  );
}

async function deliver(job) {
  const attemptNumber = Number(job.attempts) + 1;
  const startedAt = Date.now();

  let responseCode = null;
  let errorMessage = null;
  let success = false;
  let retryable = false;

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    config.webhookTimeoutMs
  );

  try {
    const response = await fetch(job.destination_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "DistributedWebhookDispatcher/1.0",
        "x-event-id": job.event_id,
        "x-webhook-event-id": job.event_id
      },
      body: JSON.stringify(job.payload),
      signal: controller.signal,
      redirect: "manual"
    });

    responseCode = response.status;
    success = response.ok;

    retryable =
      response.status === 429 || response.status >= 500;

    if (!success) {
      errorMessage =
        `Destination returned HTTP ${response.status}`;
    }

    await response.arrayBuffer().catch(() => {});
  } catch (error) {
    errorMessage =
      error.name === "AbortError"
        ? "Request timed out"
        : (error.message || "Network error");

    retryable = true;
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Date.now() - startedAt;
  const maxAttempts = config.maxAttempts;

  let nextStatus = "failed";
  let retryDelayMs = null;

  if (success) {
    nextStatus = "delivered";
  } else if (retryable && attemptNumber < maxAttempts) {
    nextStatus = "retrying";

    retryDelayMs =
      config.retryBaseDelayMs *
      Math.pow(2, attemptNumber - 1);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO webhook_delivery_attempts
         (job_id, attempt_number, status,
          response_code, error_message, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        job.id,
        attemptNumber,
        success
          ? "success"
          : (nextStatus === "retrying"
              ? "retrying"
              : "failed"),
        responseCode,
        errorMessage,
        durationMs
      ]
    );

    // FIX: Explicit PostgreSQL parameter type casting
    await client.query(
      `UPDATE webhook_jobs
       SET attempts = $2,
           status = $3::text,
           processing_started_at = NULL,
           last_response_code = $4,
           last_error = $5,
           available_at = CASE
             WHEN $6::bigint IS NULL
               THEN available_at
             ELSE NOW() +
               ($6::bigint * INTERVAL '1 millisecond')
           END,
           delivered_at = CASE
             WHEN $3::text = 'delivered'
               THEN NOW()
             ELSE delivered_at
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [
        job.id,
        attemptNumber,
        nextStatus,
        responseCode,
        errorMessage,
        retryDelayMs
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log(
    `[worker] job=${job.id} ` +
    `attempt=${attemptNumber}/${maxAttempts} ` +
    `status=${nextStatus}` +
    (retryDelayMs ? ` retryInMs=${retryDelayMs}` : "")
  );
}

async function processOne() {
  const job = await claimJob();

  if (!job) return false;

  const token = await acquireDomainToken(
    job.destination_domain
  );

  if (!token.allowed) {
    await deferForRateLimit(job.id, token.waitMs);
    return true;
  }

  await deliver(job);
  return true;
}

async function main() {
  console.log("[worker] Worker started");

  let stopping = false;

  process.on("SIGTERM", () => {
    stopping = true;
  });

  process.on("SIGINT", () => {
    stopping = true;
  });

  while (!stopping) {
    try {
      const didWork = await processOne();

      if (!didWork) {
        await sleep(config.workerPollIntervalMs);
      }
    } catch (error) {
      console.error("[worker] Processing error:", error);
      await sleep(config.workerPollIntervalMs);
    }
  }

  await closePool();
  console.log("[worker] Worker stopped");
}

main().catch(async (error) => {
  console.error("[worker] Fatal error:", error);
  await closePool();
  process.exit(1);
});
