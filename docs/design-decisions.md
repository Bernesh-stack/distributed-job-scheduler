# Design Decisions — Distributed Job Scheduler

## 1. PostgreSQL-Only Architecture (No Redis)

**Decision:** All queuing, locking, and scheduling logic lives in PostgreSQL. No Redis or external message broker.

**Rationale:**
- Reduces operational complexity — single database to manage, backup, and monitor
- PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED` provides efficient, lock-free job claiming
- Advisory locks (`pg_advisory_lock`) provide distributed locking without an external service
- Transactional guarantees ensure job state transitions are atomic
- Neon (serverless Postgres) handles scaling

**Trade-offs:**
- Higher latency than Redis for pub/sub (mitigated by polling interval tuning)
- Worker polling creates periodic load (mitigated by efficient indexed queries)
- No built-in pub/sub for real-time notifications (WebSocket polling used instead)

---

## 2. Atomic Job Claiming with SKIP LOCKED

**Decision:** Use `SELECT ... FOR UPDATE SKIP LOCKED` in a single transaction for job claiming.

**Why not `FOR UPDATE` (without SKIP LOCKED)?**
- `FOR UPDATE` blocks — multiple workers waiting on the same row creates contention
- `SKIP LOCKED` is non-blocking — workers skip already-claimed rows and grab the next one
- This gives us both atomicity AND concurrency

**SQL Pattern:**
```sql
BEGIN;
SELECT id FROM jobs
WHERE queue_id = ANY($1) AND status IN ('queued', 'retrying')
  AND (run_at IS NULL OR run_at <= NOW())
ORDER BY priority DESC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

UPDATE jobs SET status = 'claimed', claimed_by = $2 WHERE id = $3;
COMMIT;
```

**Proven by:** Concurrency test with 10 workers competing for 20 jobs — zero double-claims.

---

## 3. Explicit Job Status Enum vs. Boolean Flags

**Decision:** Model job lifecycle as an explicit Postgres ENUM type with 8 states.

**States:** `queued → scheduled → claimed → running → completed | failed → retrying → dead_letter`

**Why not boolean flags (is_complete, is_failed, etc.)?**
- Enum prevents invalid state combinations (e.g., `is_complete=true AND is_failed=true`)
- Single-column filtering is more efficient than multi-column boolean checks
- Partial indexes on status are highly selective (`WHERE status = 'queued'`)
- Clear state machine makes lifecycle auditable

---

## 4. Configurable Retry Policies as Database Rows

**Decision:** Store retry strategies (fixed, linear, exponential) as rows in a `retry_policies` table, referenced by queues.

**Why not hardcode retry logic per job type?**
- Separation of concerns — retry behavior is queue configuration, not job logic
- Reusable policies across queues
- Modifiable at runtime without code changes
- Clear mathematical formulas:
  - Fixed: `delay = base_delay_ms`
  - Linear: `delay = base_delay_ms × (retry_count + 1)`
  - Exponential: `delay = base_delay_ms × 2^retry_count` (capped at `max_delay_ms`)

---

## 5. Worker as Separate Process

**Decision:** Worker service runs as a separate Node.js process (`npm run worker`), not embedded in the API server.

**Rationale:**
- Workers can be scaled independently of the API
- Worker crashes don't affect API availability
- Different resource profiles (API is I/O bound, workers are CPU bound)
- Reconciler in API server detects worker failures and requeues jobs

**Graceful Shutdown:**
1. SIGTERM received → stop polling for new jobs
2. Set worker status to 'draining'
3. Wait for in-flight jobs to complete (30s timeout)
4. Mark worker as 'offline'
5. Exit

---

## 6. Heartbeat + Reconciler for Fault Detection

**Decision:** Workers send periodic heartbeats; a reconciler in the API server detects stale workers.

**Why not peer-to-peer worker health checking?**
- Simpler architecture — no worker-to-worker communication needed
- Reconciler runs as a single-leader pattern in the API server
- Heartbeat writes are cheap (single INSERT + UPDATE)
- Stale timeout is configurable (default 30s)

**Recovery Flow:**
1. Worker heartbeat goes stale → reconciler detects
2. All `claimed` and `running` jobs for that worker → set to `queued`
3. Worker marked `offline`
4. Other workers pick up requeued jobs on next poll

---

## 7. Simulated Job Execution (Extensible)

**Decision:** Workers simulate job execution with configurable sleep + random failure rates.

**Why?**
- This is a scheduler platform, not a business application
- The framework is extensible — add real job handlers by type in `jobExecutor.js`
- Simulation allows realistic testing of retry logic, DLQ, and metrics
- Different job types have different simulation profiles (email: fast/reliable, image processing: slow/moderate failure)

---

## 8. Frontend Design: CSS Custom Properties (No Tailwind)

**Decision:** Use vanilla CSS with custom properties (CSS variables) for the design system.

**Rationale:**
- Per project requirements — no Tailwind unless explicitly requested
- Custom properties provide themeable design tokens (colors, spacing, typography)
- Dark mode design matching reference screenshots
- Glassmorphism, gradients, and micro-animations for premium feel
- Google Font: Inter for UI, JetBrains Mono for code/data

---

## 9. Polling vs WebSocket for Live Updates

**Decision:** Use polling (5-10 second intervals) for dashboard updates.

**Why not WebSocket?**
- Simpler implementation — no WebSocket server to manage
- Adequate for dashboard-level metrics (not real-time streaming)
- Reduces complexity in both backend and frontend
- Could be upgraded to WebSocket for the "live updates" bonus if needed

---

## 10. UUID Primary Keys

**Decision:** All tables use UUID v4 primary keys.

**Rationale:**
- Globally unique — safe for distributed systems
- No sequential guessing (security)
- Can be generated client-side or server-side
- Postgres `gen_random_uuid()` is efficient

**Trade-off:** Slightly larger than integer PKs (16 bytes vs 4 bytes), but negligible for this scale.
