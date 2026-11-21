CREATE TABLE IF NOT EXISTS webhook_jobs (
  id BIGSERIAL PRIMARY KEY,
  destination_url TEXT NOT NULL,
  destination_domain TEXT NOT NULL,
  event_id VARCHAR(200) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'processing', 'retrying', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  last_response_code INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_jobs_ready
  ON webhook_jobs (available_at, created_at)
  WHERE status IN ('queued', 'retrying');

CREATE INDEX IF NOT EXISTS idx_webhook_jobs_status_created
  ON webhook_jobs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES webhook_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'retrying', 'failed')),
  response_code INTEGER,
  error_message TEXT,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_job
  ON webhook_delivery_attempts (job_id, attempt_number);

CREATE TABLE IF NOT EXISTS domain_rate_limits (
  domain TEXT PRIMARY KEY,
  tokens NUMERIC(12, 4) NOT NULL,
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
