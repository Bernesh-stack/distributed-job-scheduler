# ER Diagram — Distributed Job Scheduler

## Entity Relationship Diagram

```mermaid
erDiagram
    USERS {
        uuid id PK
        varchar email UK
        varchar password_hash
        varchar name
        varchar role
        timestamptz created_at
        timestamptz updated_at
    }

    ORGANIZATIONS {
        uuid id PK
        varchar name
        uuid owner_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    PROJECTS {
        uuid id PK
        varchar name
        text description
        uuid org_id FK
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    RETRY_POLICIES {
        uuid id PK
        varchar name
        varchar strategy
        int max_retries
        int base_delay_ms
        int max_delay_ms
        timestamptz created_at
    }

    QUEUES {
        uuid id PK
        uuid project_id FK
        varchar name
        int priority
        int concurrency_limit
        uuid retry_policy_id FK
        boolean is_paused
        int rate_limit_max
        int rate_limit_window_ms
        timestamptz created_at
        timestamptz updated_at
    }

    JOBS {
        uuid id PK
        uuid queue_id FK
        varchar type
        jsonb payload
        job_status status
        int priority
        int max_retries
        int retry_count
        timestamptz scheduled_at
        timestamptz run_at
        timestamptz started_at
        timestamptz completed_at
        uuid claimed_by FK
        int execution_duration_ms
        jsonb result
        text error
        varchar cron_expression
        uuid batch_id
        uuid_array depends_on
        varchar idempotency_key
        timestamptz created_at
        timestamptz updated_at
    }

    WORKERS {
        uuid id PK
        varchar hostname
        varchar ip_address
        varchar version
        int concurrency_limit
        int active_jobs
        varchar status
        uuid_array queue_ids
        timestamptz last_heartbeat
        timestamptz registered_at
    }

    WORKER_HEARTBEATS {
        uuid id PK
        uuid worker_id FK
        timestamptz timestamp
        int active_jobs
        real cpu_usage
        real memory_usage
    }

    JOB_EXECUTIONS {
        uuid id PK
        uuid job_id FK
        uuid worker_id FK
        int attempt
        varchar status
        timestamptz started_at
        timestamptz completed_at
        int duration_ms
        text error
        jsonb result
    }

    JOB_LOGS {
        uuid id PK
        uuid job_id FK
        uuid execution_id FK
        varchar level
        text message
        jsonb metadata
        timestamptz timestamp
    }

    SCHEDULED_JOBS {
        uuid id PK
        uuid queue_id FK
        varchar name
        varchar cron_expression
        varchar job_type
        jsonb job_payload
        boolean is_active
        timestamptz last_run_at
        timestamptz next_run_at
        timestamptz created_at
        timestamptz updated_at
    }

    DEAD_LETTER_QUEUE {
        uuid id PK
        uuid original_job_id FK
        uuid queue_id FK
        varchar job_type
        jsonb payload
        text error
        int retry_count
        timestamptz failed_at
        boolean reprocessed
        timestamptz reprocessed_at
        uuid reprocessed_job_id FK
    }

    RATE_LIMIT_COUNTERS {
        uuid id PK
        varchar key
        timestamptz window_start
        int window_size_ms
        int count
        int max_count
    }

    USERS ||--o{ ORGANIZATIONS : "owns"
    ORGANIZATIONS ||--o{ PROJECTS : "contains"
    USERS ||--o{ PROJECTS : "creates"
    PROJECTS ||--o{ QUEUES : "has"
    RETRY_POLICIES ||--o{ QUEUES : "configures"
    QUEUES ||--o{ JOBS : "contains"
    QUEUES ||--o{ SCHEDULED_JOBS : "schedules"
    QUEUES ||--o{ DEAD_LETTER_QUEUE : "stores failures"
    WORKERS ||--o{ JOBS : "claims"
    WORKERS ||--o{ WORKER_HEARTBEATS : "sends"
    JOBS ||--o{ JOB_EXECUTIONS : "records"
    JOBS ||--o{ JOB_LOGS : "logs"
    JOB_EXECUTIONS ||--o{ JOB_LOGS : "references"
    WORKERS ||--o{ JOB_EXECUTIONS : "executes"
    JOBS ||--o{ DEAD_LETTER_QUEUE : "moves to"
```

## Key Relationships

| Relationship | Type | Cascade |
|-------------|------|---------|
| Users → Organizations | 1:N | ON DELETE CASCADE |
| Organizations → Projects | 1:N | ON DELETE CASCADE |
| Projects → Queues | 1:N | ON DELETE CASCADE |
| Queues → Jobs | 1:N | ON DELETE CASCADE |
| Jobs → Job Executions | 1:N | ON DELETE CASCADE |
| Jobs → Job Logs | 1:N | ON DELETE CASCADE |
| Workers → Worker Heartbeats | 1:N | ON DELETE CASCADE |
| Jobs → Dead Letter Queue | 1:N | ON DELETE CASCADE |
| Retry Policies → Queues | 1:N | ON DELETE SET NULL |
| Workers → Jobs (claimed_by) | 1:N | ON DELETE SET NULL |

## Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| jobs | `(queue_id, status, run_at) WHERE status IN ('queued', 'retrying')` | Worker polling query optimization |
| jobs | `(status)` | Dashboard status filtering |
| jobs | `(claimed_by) WHERE NOT NULL` | Worker job lookup |
| jobs | `(batch_id) WHERE NOT NULL` | Batch job queries |
| jobs | `(idempotency_key) WHERE NOT NULL` | Idempotent job creation |
| workers | `(status)` | Active worker queries |
| workers | `(last_heartbeat) WHERE status = 'active'` | Stale worker detection |
| worker_heartbeats | `(worker_id, timestamp DESC)` | Heartbeat timeline |
| job_logs | `(job_id, timestamp DESC)` | Job log retrieval |
| dead_letter_queue | `(reprocessed, failed_at DESC)` | Unprocessed DLQ listing |

## Normalization

- **3NF**: All tables are in third normal form
- **Retry policies** are normalized into their own table (not embedded in queues/jobs)
- **Job executions** separate from jobs to maintain full retry history
- **Worker heartbeats** separate from workers for time-series monitoring
