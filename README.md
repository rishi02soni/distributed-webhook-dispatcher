
# Distributed Webhook Dispatcher

A persistent, asynchronous webhook delivery system built using **Node.js, Express, and PostgreSQL**.

This project was developed as a backend internship assignment to demonstrate reliable webhook delivery, asynchronous job processing, retry mechanisms, rate limiting, database persistence, and deployment.

## Live Deployment

**Live API:** https://webhook-dispatcher-api-3gbc.onrender.com

**Health Check:** https://webhook-dispatcher-api-3gbc.onrender.com/health

**Deployment Platform:** Render

**Database:** PostgreSQL

**Repository:** https://github.com/rishi02soni/distributed-webhook-dispatcher

The application is deployed using a Render Free Web Service.

For the demonstration deployment, the API and webhook worker run together through a startup script.

> Note: Render Free Web Services may spin down after inactivity. The application may take additional time to respond when waking up.

---

## 1. Project Overview

The Distributed Webhook Dispatcher accepts webhook events through an HTTP API, stores them in PostgreSQL, and delivers them asynchronously to external destination URLs.

Instead of immediately sending a webhook during the API request, the application queues the event and returns a response.

A background worker processes queued jobs, delivers the payload, retries temporary failures, and records delivery attempts.

### Main Objectives

- Accept webhook events through a REST API.
- Store webhook jobs persistently.
- Process jobs asynchronously.
- Implement automatic retries with exponential backoff.
- Apply per-domain rate limiting.
- Support multiple workers safely.
- Track delivery status and attempts.
- Protect endpoints using API key authentication.
- Deploy and test the application online.

---

## 2. Technology Stack

| Technology | Purpose |
|------------|---------|
| Node.js | JavaScript runtime |
| Express.js | REST API framework |
| PostgreSQL | Persistent database and job queue |
| pg | PostgreSQL client |
| JavaScript | Application development |
| Render | Cloud deployment |
| GitHub | Version control |
| Postman | API testing |
| Webhook.site | Webhook delivery testing |

### Requirements

- Node.js 20 or later
- PostgreSQL 14 or later
- npm
- Git
- VS Code (recommended)

---

## 3. Features

### Asynchronous Webhook Dispatching

The API accepts webhook events and immediately returns HTTP `202 Accepted`.

The worker handles actual delivery separately from the API request.

### Persistent Job Queue

Webhook jobs are stored in PostgreSQL.

Jobs remain in the database until processed, even if the application restarts.

### Automatic Retry Mechanism

Temporary failures are retried automatically using exponential backoff.

Retryable conditions include:

- HTTP 429 (Too Many Requests)
- HTTP 5xx server errors
- Network errors
- Request timeouts

Other HTTP 4xx responses are treated as permanent failures.

### Per-Domain Rate Limiting

A token-bucket algorithm controls how frequently webhooks are delivered to each destination domain.

### Concurrent Worker Safety

PostgreSQL `FOR UPDATE SKIP LOCKED` allows multiple workers to claim jobs without processing the same queued job simultaneously.

### Delivery Tracking

The system records:

- Job ID
- Event ID
- Destination URL
- Delivery status
- Attempt count
- HTTP response code
- Error details
- Creation and delivery timestamps

### API Authentication

Protected endpoints require a valid Bearer token.

---

## 4. System Architecture

```text
                  CLIENT / POSTMAN
                         |
                         |
                         v
                 EXPRESS REST API
                         |
                         |
                         v
                 VALIDATE REQUEST
                         |
                         |
                         v
                  POSTGRESQL DB
                  (Webhook Queue)
                         |
                         |
                         v
                  BACKGROUND WORKER
                         |
                         |
              +----------+----------+
              |                     |
              v                     v
        RATE LIMIT CHECK       RETRY HANDLING
              |                     |
              +----------+----------+
                         |
                         v
                 DESTINATION SERVER
                         |
                         v
                 DELIVERY RESPONSE
                         |
                         v
                  UPDATE DATABASE
                         |
                         v
                 JOB STATUS / LOGS
```

### How It Works

1. A client submits a webhook event.
2. The API validates the request.
3. The event is stored in PostgreSQL.
4. The API returns `202 Accepted`.
5. The worker claims an available job.
6. The worker checks the destination's rate limit.
7. The worker sends an HTTP POST request.
8. Successful deliveries are marked `delivered`.
9. Temporary failures are scheduled for retry.
10. Every delivery attempt is recorded in the database.

---

## 5. Project Structure

```text
distributed-webhook-dispatcher/
|
|-- db/
|   |-- schema.sql
|
|-- docs/
|   |-- TESTING.md
|
|-- scripts/
|   |-- migrate.js
|
|-- src/
|   |-- app.js
|   |-- auth.js
|   |-- config.js
|   |-- db.js
|   |-- server.js
|   |-- start-production.js
|   |-- validation.js
|   |-- worker.js
|
|-- test/
|   |-- validation.test.js
|
|-- .env.example
|-- .gitignore
|-- package.json
|-- package-lock.json
|-- README.md
|-- render.yaml
```

### Important Files

| File | Description |
|------|-------------|
| `app.js` | Express application and API routes |
| `auth.js` | API key authentication |
| `config.js` | Environment configuration |
| `db.js` | PostgreSQL connection pool |
| `server.js` | API server startup |
| `start-production.js` | Starts API and worker together |
| `validation.js` | Webhook request validation |
| `worker.js` | Background delivery processing |
| `schema.sql` | Database schema |
| `migrate.js` | Database migration script |
| `render.yaml` | Render deployment configuration |

---

## 6. Database Design

The application uses three main PostgreSQL tables.

### webhook_jobs

Stores webhook jobs and their processing status.

Important fields:

- `id`
- `destination_url`
- `destination_domain`
- `event_id`
- `payload`
- `status`
- `attempts`
- `available_at`
- `processing_started_at`
- `last_response_code`
- `last_error`
- `created_at`
- `updated_at`
- `delivered_at`

### webhook_delivery_attempts

Stores the history of webhook delivery attempts.

Important fields:

- `id`
- `job_id`
- `attempt_number`
- `status`
- `response_code`
- `error_message`
- `duration_ms`
- `created_at`

### domain_rate_limits

Maintains rate-limiting information for each destination domain.

Important fields:

- `domain`
- `tokens`
- `last_refill_at`

---

## 7. Local Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/rishi02soni/distributed-webhook-dispatcher.git
```

Navigate into the project:

```bash
cd distributed-webhook-dispatcher
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Create PostgreSQL Database

Start PostgreSQL and execute:

```sql
CREATE DATABASE webhook_dispatcher;
```

### Step 4: Configure Environment Variables

Create a `.env` file using `.env.example`.

Example:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/webhook_dispatcher

DISPATCH_API_KEY=local-test-secret

ALLOW_PRIVATE_DESTINATIONS=true

WORKER_POLL_INTERVAL_MS=500
WEBHOOK_TIMEOUT_MS=10000

MAX_ATTEMPTS=4
RETRY_BASE_DELAY_MS=2000

RATE_LIMIT_CAPACITY=5
RATE_LIMIT_REFILL_PER_SECOND=1
```

Replace `YOUR_PASSWORD` with your PostgreSQL password.

**Security:** Never commit `.env` or real credentials to GitHub.

`ALLOW_PRIVATE_DESTINATIONS=true` is intended only for local testing. Use `false` in production.

### Step 5: Run Database Migration

```bash
npm run db:migrate
```

Expected output:

```text
Database schema applied successfully.
```

### Step 6: Start the Application

Run:

```bash
npm start
```

The startup script launches both the API and the worker.

Expected output:

```text
[worker] Worker started
[api] Listening on port 3000
```

The API will be available at:

```text
http://localhost:3000
```

---

## 8. API Documentation

### 8.1 Health Check

**Method:** GET

**Endpoint:**

```text
GET /health
```

Local URL:

```text
http://localhost:3000/health
```

Live URL:

```text
https://webhook-dispatcher-api-3gbc.onrender.com/health
```

Expected response:

```json
{
  "status": "ok",
  "database": "connected"
}
```

### 8.2 Dispatch a Webhook

**Method:** POST

**Endpoint:**

```text
POST /api/webhooks/dispatch
```

Live URL:

```text
https://webhook-dispatcher-api-3gbc.onrender.com/api/webhooks/dispatch
```

#### Headers

```text
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

#### Request Body

```json
{
  "destinationUrl": "https://example.com/webhook",
  "eventId": "evt_test_001",
  "payload": {
    "event": "user.signup",
    "userId": "usr_999"
  }
}
```

Replace `https://example.com/webhook` with an actual webhook receiver URL, such as one generated by Webhook.site.

#### Expected Response

HTTP `202 Accepted`

```json
{
  "status": "queued",
  "jobId": "1",
  "eventId": "evt_test_001",
  "createdAt": "2026-11-21T13:50:55.344Z"
}
```

The job ID and timestamp are generated dynamically.

### 8.3 Get Webhook Job Status

**Method:** GET

**Endpoint:**

```text
GET /api/webhooks/jobs/:jobId
```

Example:

```text
https://webhook-dispatcher-api-3gbc.onrender.com/api/webhooks/jobs/1
```

#### Authorization

```text
Authorization: Bearer YOUR_API_KEY
```

The response includes the job details and delivery-attempt history.

Example job information:

```json
{
  "id": "1",
  "event_id": "evt_test_001",
  "status": "delivered",
  "attempts": 1,
  "last_response_code": 200,
  "last_error": null
}
```

This is an illustrative job object; the actual endpoint wraps job information and includes additional fields.

### 8.4 Get Delivery Attempts

**Method:** GET

**Endpoint:**

```text
GET /api/webhooks/jobs/:jobId/attempts
```

Example:

```text
https://webhook-dispatcher-api-3gbc.onrender.com/api/webhooks/jobs/1/attempts
```

#### Authorization

```text
Authorization: Bearer YOUR_API_KEY
```

This endpoint retrieves the delivery-attempt history for a specific job.

---

## 9. Webhook Job Statuses

| Status | Meaning |
|--------|---------|
| queued | Waiting for processing |
| processing | Currently being delivered |
| retrying | Waiting for the next retry |
| delivered | Successfully delivered |
| failed | Permanently failed or retries exhausted |

---

## 10. Retry Mechanism

The dispatcher implements exponential backoff.

Default configuration:

```env
MAX_ATTEMPTS=4
RETRY_BASE_DELAY_MS=2000
```

This means one initial delivery attempt and up to three retries.

| Attempt | Delay Before Attempt |
|---------|----------------------|
| 1 | Immediate |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |

### Retryable Errors

- HTTP 429
- HTTP 500–599
- Network connection failures
- Request timeouts

### Non-Retryable Errors

Other HTTP 400–499 responses are considered permanent failures.

After the final unsuccessful attempt, the job status becomes `failed`.

---

## 11. Rate Limiting

The dispatcher implements a token-bucket algorithm for each destination domain.

Configuration:

```env
RATE_LIMIT_CAPACITY=5
RATE_LIMIT_REFILL_PER_SECOND=1
```

### Explanation

- Each domain has its own token bucket.
- The bucket can hold up to five tokens.
- One token is replenished per second.
- Each webhook delivery consumes one token.
- If no token is available, the job is rescheduled.

This prevents excessive webhook requests to the same destination domain.

---

## 12. Concurrent Processing

The worker uses PostgreSQL row-level locking:

```sql
FOR UPDATE SKIP LOCKED
```

This enables multiple workers to process different jobs safely.

If one worker has already locked a job, another worker skips that row and selects another available job.

### Crash Recovery

Jobs left in `processing` after a worker crash can become eligible for recovery after the configured processing lease expires.

The current implementation uses a one-minute lease.

---

## 13. Security

The application includes several security controls.

### API Key Authentication

Protected API endpoints require a Bearer token.

```text
Authorization: Bearer YOUR_API_KEY
```

### Environment Variables

Sensitive credentials are stored in environment variables rather than source code.

### SSRF Protection

Production validation rejects private or local destination addresses and checks DNS results to reduce server-side request forgery risks.

### Redirect Protection

Outbound webhook delivery does not follow HTTP redirects.

### Request Size Limit

Request bodies are limited to 256 KB.

### Production Configuration

```env
NODE_ENV=production
ALLOW_PRIVATE_DESTINATIONS=false
```

The current destination validation provides baseline protection. Additional network-level egress controls are recommended for high-security production environments.

---

## 14. Deployment on Render

The project is deployed using:

- Render Free Web Service
- Render PostgreSQL
- GitHub repository integration

### Deployment Architecture

```text
             CLIENT / POSTMAN
                    |
                    v
            RENDER WEB SERVICE
                    |
          +---------+---------+
          |                   |
          v                   v
      EXPRESS API       WEBHOOK WORKER
          |                   |
          +---------+---------+
                    |
                    v
             RENDER POSTGRESQL
                    |
                    v
             WEBHOOK DELIVERY
```

### Deployment Configuration

The Render deployment is defined in:

```text
render.yaml
```

The Web Service uses the project's startup command:

```bash
npm start
```

This runs:

```bash
node src/start-production.js
```

The startup script launches the API and worker processes.

### Environment Variables

Configure the following variables on Render:

```env
NODE_ENV=production
DATABASE_URL=YOUR_RENDER_DATABASE_URL
DISPATCH_API_KEY=YOUR_SECURE_API_KEY
ALLOW_PRIVATE_DESTINATIONS=false
WORKER_POLL_INTERVAL_MS=500
WEBHOOK_TIMEOUT_MS=10000
MAX_ATTEMPTS=4
RETRY_BASE_DELAY_MS=2000
RATE_LIMIT_CAPACITY=5
RATE_LIMIT_REFILL_PER_SECOND=1
```

The database URL and API key must be configured securely.

### Database Migration

The production database must have the tables defined in:

```text
db/schema.sql
```

The migration command is:

```bash
npm run db:migrate
```

### Deployment Status

The deployment was verified using Render, Postman, and Webhook.site.

The API successfully accepted a webhook event, and the worker delivered it to the destination.

### Free Tier Limitation

Render Free Web Services may spin down during inactivity.

Since the API and worker share one Web Service in this demonstration, webhook processing may be delayed while the service is inactive.

For production workloads requiring continuous processing, the worker should run as an independent background service.

---

## 15. Testing

Testing was performed using:

- Node.js test runner
- Postman
- Webhook.site
- PostgreSQL
- Render

### Automated Tests

Run:

```bash
npm test
```

Validation tests completed successfully:

```text
4 tests passed
0 tests failed
```

### Manual Testing

The following scenarios were tested:

1. Webhook request validation
2. Successful webhook queue insertion
3. HTTP 202 response
4. Background webhook delivery
5. Delivery status retrieval
6. Delivery-attempt tracking
7. Retry handling for HTTP 429
8. Concurrent job processing
9. Live deployment webhook delivery

Additional testing instructions are available in:

```text
docs/TESTING.md
```

---

## 16. Live Deployment Test Results

The deployed application was tested using Postman and Webhook.site.

### Test 1: Dispatch Webhook

**Request:**

```text
POST /api/webhooks/dispatch
```

**Result:**

```text
HTTP 202 Accepted
```

Example response from the live test:

```json
{
  "status": "queued",
  "jobId": "1",
  "eventId": "render-live-test-001",
  "createdAt": "2026-11-21T13:50:55.344Z"
}
```

### Test 2: Webhook.site Delivery

The destination received an HTTP POST request containing:

```json
{
  "source": "Render Deployment",
  "message": "Testing live webhook delivery"
}
```

The received request included the event identifier:

```text
X-Event-Id: render-live-test-001
```

### Test 3: Job Status Verification

**Request:**

```text
GET /api/webhooks/jobs/1
```

**Result:**

```text
HTTP 200 OK
```

The job response confirmed:

```json
{
  "status": "delivered",
  "attempts": 1,
  "last_response_code": 200,
  "last_error": null
}
```

### Final Test Outcome

| Test | Result |
|------|--------|
| Render deployment | Passed |
| API accessibility | Passed |
| Webhook dispatch | Passed |
| HTTP 202 response | Passed |
| Background processing | Passed |
| Webhook.site delivery | Passed |
| Job status API | Passed |
| Delivery confirmation | Passed |

---

## 17. Delivery Guarantees

The dispatcher implements **at-least-once delivery**.

This means a webhook may occasionally be delivered more than once.

For example, if the destination receives a webhook but the worker crashes before recording success, the job may be delivered again during recovery.

Webhook consumers should therefore implement idempotency using:

- `eventId`
- `X-Event-Id` header

Exactly-once delivery is not guaranteed.

---

## 18. Future Improvements

Potential enhancements include:

- Structured application logging
- Prometheus metrics
- Monitoring dashboards
- Dead-letter queue
- Webhook request signing
- Destination allowlists
- Independent production worker deployment
- Improved alerting and observability
- Additional integration tests
- Stronger outbound network security

---

## 19. Conclusion

The Distributed Webhook Dispatcher demonstrates a practical approach to reliable asynchronous webhook processing.

The system combines:

- REST API development
- PostgreSQL persistence
- Background job processing
- Exponential retry handling
- Domain-based rate limiting
- Concurrent worker safety
- API authentication
- Cloud deployment
- End-to-end testing

The project has been successfully deployed and tested using Render, Postman, and Webhook.site.

It demonstrates important backend engineering concepts used in event-driven systems and asynchronous processing architectures.

---

## Evaluation Access

The live API is protected using Bearer Token authentication.

A temporary reviewer API key is provided privately to
the hiring team for testing.

### Live API

https://webhook-dispatcher-api-3gbc.onrender.com

### Endpoints

POST /api/webhooks/dispatch
GET /api/webhooks/jobs/:id
GET /health

### Authentication

In Postman:
1. Open the Authorization tab.
2. Select Bearer Token.
3. Enter the reviewer API key provided by email.
4. Send the request.

The health endpoint does not require authentication.

### Verified Live Test

- POST dispatch returned 202 Accepted.
- Background worker delivered the webhook.
- GET job status returned 200 OK.
- Delivery status: delivered.
- Destination response: 200.

Note: The free-tier Render instance may take extra time
to respond after inactivity.

---

## Author

**Rishi Soni**

Backend Development Internship Assignment

**GitHub:** https://github.com/rishi02soni/distributed-webhook-dispatcher
