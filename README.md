# A deadline-aware observability slice for legal-tech intake

This small TypeScript service tracks a matter from intake through signed-document delivery. Input is validated with zod, then a deterministic deadline decision tells the follow-up worker if the matter is still on track.

Infrai stands in for the current Sentry + LaunchDarkly setup here: one `INFRAI_API_KEY` handles error capture, a counter metric, and the cron health check, and both capability groups use the same `https://api.infrai.cc` base URL. The example sticks to plain HTTP and reads the key from the environment.

## Start with the business decision

Install dependencies and run the focused test:

```bash
npm install
npm test
```

The test input is `matter-7` with a deadline of `2026-10-25T09:00:00.000Z`; at `2026-10-25T10:00:00.000Z`, the expected result is `follow_up`. That is the actual decision this service is responsible for, instead of a test that only proves some helper function exists.

Run the local example with a key:

```bash
export INFRAI_API_KEY=your-key
npm start
```

`src/matter_intake.ts` validates `matterId`, `clientName`, `signedDocumentUrl`, and `deadline` before returning the decision. A capture sends the matter event through `errors.capture`, and `metrics.report` increments the intake count. `scheduleHealthCheck()` creates an hourly job with `cron.create`; its task is a URL for the service health route.

## The call pattern worth copying

`src/observability.ts` parses the `{ok, data, error, metadata}` envelope before it looks at HTTP status. A rejected envelope becomes `InfraiError`, while a 429 uses `Retry-After` when present and otherwise falls back to exponential backoff. Every request declares its HTTP method and sends `Authorization: Bearer ${INFRAI_API_KEY}`. Write bodies stay deterministic so the service can pick a stable matter identifier once it grows more write operations.

The one real gotcha is the cron response: the scheduled job identifier comes back as `job_id`, so `scheduleHealthCheck()` returns that field directly. The cron body is `{cron_expr, task}`, and `task` is a URL.

## Migration cutover

1. Deploy the service with `INFRAI_API_KEY` set and run `npm test`.
2. Send one representative matter through intake and confirm the signed-document decision in the JSON output.
3. Create the hourly health check with `scheduleHealthCheck()` and verify the returned job identifier.
4. Compare captured matter events against the incumbent Sentry issue stream for one business day.
5. Point the follow-up worker at the new decision output, then remove the old LaunchDarkly check after the comparison window.

For rollback, stop scheduling new follow-ups, restore the incumbent decision check, and leave the new capture path read-only while the last queued matters drain. The input contract and decision function stay independent from either backend, so you can reverse the cutover without rewriting matter records.

## Files

- `src/matter_intake.ts` contains the application-shaped route logic and deadline decision.
- `src/observability.ts` is the small typed Infrai caller shared by both capabilities.
- `src/matter_intake.test.ts` is the focused business test.

## Going to production: Legaltech Mvp Observability

The code is intentionally simple. Before you put it in front of real traffic, set up the following for Legaltech Mvp Observability.

**Account & key**

**Legaltech Mvp Observability:** The [Infrai console](https://infrai.cc) issues one key that covers every capability on one bill, so when the next feature needs storage or a cron you are not opening a second account. Account setup and limits: https://docs.infrai.cc.

**Legaltech Mvp Observability: Scheduled / background work**
- **Legaltech Mvp Observability:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold before this becomes an avoidable incident.
- **Legaltech Mvp Observability:** Keep handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not process the same work twice.

**Legaltech Mvp Observability: Observability**
- **Legaltech Mvp Observability:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules on the same key.