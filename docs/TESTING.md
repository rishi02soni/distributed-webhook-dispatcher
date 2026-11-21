# End-to-end testing guide

Use two VS Code terminals: one for the API and one for the worker.

## Test 1: Health endpoint

```bash
curl -i http://localhost:3000/health
```

Expected: `200 OK`.

## Test 2: Successful delivery

Start a local mock receiver in a third terminal:

```bash
node -e "require('http').createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{console.log('RECEIVED',req.method,req.headers['x-event-id'],b);res.writeHead(200,{'content-type':'application/json'});res.end('{\"received\":true}')})}).listen(4000,()=>console.log('Mock receiver on 4000'))"
```

Dispatch:

```bash
curl -i -X POST http://localhost:3000/api/webhooks/dispatch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-test-secret" \
  -d '{"destinationUrl":"http://127.0.0.1:4000/hook","eventId":"evt_success_1","payload":{"event":"user.signup","userId":"usr_999"}}'
```

Expected:
- API returns `202` quickly.
- Mock receiver prints the event.
- Job status becomes `delivered`.
- One attempt is stored with status `success`.

Copy the `jobId` from the API response:

```bash
curl http://localhost:3000/api/webhooks/jobs/JOB_ID \
  -H "Authorization: Bearer local-test-secret"
```

## Test 3: Retry behavior (HTTP 500)

Start a receiver that always returns 500:

```bash
node -e "require('http').createServer((req,res)=>{req.resume();req.on('end',()=>{console.log('Returning 500');res.writeHead(500);res.end('temporary failure')})}).listen(4001,()=>console.log('Failing receiver on 4001'))"
```

Dispatch to `http://127.0.0.1:4001/hook`.

Expected worker log:
- attempt 1 -> retrying (next attempt after ~2 seconds)
- attempt 2 -> retrying (next attempt after ~4 seconds)
- attempt 3 -> retrying (next attempt after ~8 seconds)
- attempt 4 -> failed

The job should show 4 delivery attempts.

## Test 4: Permanent 4xx failure

Use a receiver that returns 400, then dispatch to it.

Expected:
- One attempt only.
- Job status `failed`.
- No retries.

## Test 5: Timeout

Start a receiver that waits 15 seconds before responding:

```bash
node -e "require('http').createServer((req,res)=>{req.resume();req.on('end',()=>setTimeout(()=>{res.end('late')},15000))}).listen(4002,()=>console.log('Slow receiver on 4002'))"
```

Set `WEBHOOK_TIMEOUT_MS=3000` in `.env`, restart the worker, and dispatch to port 4002.

Expected: timeout is recorded and retried using the configured backoff.

## Test 6: Missing/invalid fields

Try dispatching with no eventId, no payload, invalid URL, or malformed JSON.

Expected: HTTP `400 Bad Request`.

## Test 7: Authentication

Send a request without the Authorization header while `DISPATCH_API_KEY` is configured.

Expected: HTTP `401 Unauthorized`.

## Test 8: Per-domain rate limit

Set a low bucket for testing:

```env
RATE_LIMIT_CAPACITY=1
RATE_LIMIT_REFILL_PER_SECOND=0.2
```

Restart the worker and enqueue several jobs to the same destination hostname.

Expected: the worker spaces deliveries out as tokens refill. Jobs remain queued while waiting for a token.

## Final verification checklist

- [ ] `/health` returns 200.
- [ ] Dispatch endpoint returns 202 without waiting for receiver response.
- [ ] Successful destination produces `delivered`.
- [ ] HTTP 500 produces 3 retries, then `failed`.
- [ ] HTTP 429 is retried.
- [ ] HTTP 400 is not retried.
- [ ] Timeout is retried.
- [ ] Every attempt is present in the database.
- [ ] API key is required when configured.
- [ ] Multiple worker processes do not claim the same queued row concurrently.
- [ ] Live Render API and worker both run against the same PostgreSQL database.
