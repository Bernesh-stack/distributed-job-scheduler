# API Documentation — Distributed Job Scheduler

Base URL: `http://localhost:3000/api`

All endpoints return errors in the format:
```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": "Additional context or null"
}
```

---

## Authentication

### POST `/auth/register`
Create a new user account.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "secure123",
  "name": "Admin User"
}
```

**Response (201):**
```json
{
  "user": { "id": "uuid", "email": "admin@example.com", "name": "Admin User", "role": "admin" },
  "token": "eyJhbG..."
}
```

### POST `/auth/login`
Authenticate and receive JWT.

**Request:**
```json
{ "email": "admin@example.com", "password": "secure123" }
```

**Response (200):** Same shape as register.

### GET `/auth/me`
Get current user profile. **Requires: Bearer token.**

---

## Projects

All project endpoints require `Authorization: Bearer <token>`.

### POST `/projects`
```json
{ "name": "Production", "description": "Main production project" }
```

### GET `/projects?page=1&limit=20`
Paginated project listing.

### GET `/projects/:id`
### PUT `/projects/:id`
### DELETE `/projects/:id`

---

## Queues

### POST `/projects/:projectId/queues`
```json
{
  "name": "email_processing",
  "priority": 10,
  "concurrencyLimit": 50,
  "retryPolicyId": "uuid-of-retry-policy"
}
```

### GET `/projects/:projectId/queues?page=1&limit=20`
Returns queues with stats (pending, running, failed, completed counts).

### GET `/projects/:projectId/queues/:id`
### PUT `/projects/:projectId/queues/:id`
### POST `/projects/:projectId/queues/:id/pause`
### POST `/projects/:projectId/queues/:id/resume`
### DELETE `/projects/:projectId/queues/:id`

---

## Jobs

### POST `/queues/:queueId/jobs` — Create Job
```json
{
  "type": "email_send",
  "payload": { "to": "user@example.com", "subject": "Hello" },
  "priority": 5,
  "scheduledAt": "2024-12-01T10:00:00Z",
  "cronExpression": "*/5 * * * *",
  "idempotencyKey": "unique-key-123",
  "maxRetries": 5
}
```

Supports: immediate, delayed (`scheduledAt`), recurring (`cronExpression`), idempotent.

### POST `/queues/:queueId/jobs/batch` — Batch Create
```json
{
  "jobs": [
    { "type": "email_send", "payload": { "to": "a@b.com" } },
    { "type": "email_send", "payload": { "to": "c@d.com" } }
  ]
}
```

### GET `/jobs?page=1&limit=20&status=running&type=email&sortBy=created_at&sortOrder=DESC`
List all jobs across queues with filtering and pagination.

### GET `/jobs/:id`
Job detail with execution history.

### POST `/jobs/:id/retry`
Retry a failed or dead_letter job.

### POST `/jobs/:id/cancel`
Cancel a queued or scheduled job.

### GET `/jobs/:id/logs?page=1&limit=50`
Job execution logs.

---

## Workers

### GET `/workers?page=1&limit=20&status=active`
List workers with current job counts.

### GET `/workers/stats`
Cluster-level stats (total, active, capacity, utilization).

### GET `/workers/:id`
### GET `/workers/:id/heartbeats?page=1&limit=50`

---

## Dead Letter Queue

### GET `/dlq?page=1&limit=20&reprocessed=false`
### POST `/dlq/:id/retry` — Reprocess DLQ entry
### DELETE `/dlq/:id` — Discard DLQ entry

---

## Metrics

### GET `/metrics/dashboard`
Overall dashboard statistics (throughput, backlog, failures, avg execution time).

### GET `/metrics/throughput?hours=24&interval=1 hour`
Time-series job throughput data.

### GET `/metrics/success-rate?hours=24`
Success/failure/retry counts and percentage.

### GET `/metrics/queue-health`
Per-queue health status with pending/running/failed counts.

### GET `/metrics/execution-times`
Average and percentile execution times per queue.

---

## Retry Policies

### GET `/retry-policies`
List all available retry policies.

```json
[
  {
    "id": "uuid",
    "name": "default-exponential",
    "strategy": "exponential",
    "max_retries": 5,
    "base_delay_ms": 1000,
    "max_delay_ms": 60000
  }
]
```

---

## Authentication Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | AUTH_REQUIRED | Missing Authorization header |
| 401 | INVALID_TOKEN | Malformed JWT |
| 401 | TOKEN_EXPIRED | Expired JWT |
| 403 | FORBIDDEN | Insufficient role permissions |

## Validation Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Request body/query failed Joi validation |

Response includes `details` array:
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "email", "message": "\"email\" must be a valid email" }
  ]
}
```
