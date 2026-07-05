CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE TABLE retry_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    strategy VARCHAR(20) NOT NULL CHECK (strategy IN ('fixed', 'linear', 'exponential')),
    max_retries INT NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
    base_delay_ms INT NOT NULL DEFAULT 1000 CHECK (base_delay_ms >= 0),
    max_delay_ms INT NOT NULL DEFAULT 60000 CHECK (max_delay_ms >= base_delay_ms),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO retry_policies (name, strategy, max_retries, base_delay_ms, max_delay_ms) VALUES
    ('default-fixed', 'fixed', 3, 5000, 5000),
    ('default-linear', 'linear', 5, 1000, 30000),
    ('default-exponential', 'exponential', 5, 1000, 60000);
CREATE TABLE queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    priority INT NOT NULL DEFAULT 10 CHECK (priority BETWEEN 1 AND 100),
    concurrency_limit INT NOT NULL DEFAULT 10 CHECK (concurrency_limit >= 1),
    retry_policy_id UUID REFERENCES retry_policies(id) ON DELETE SET NULL,
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    rate_limit_max INT,
    rate_limit_window_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, name)
);
CREATE INDEX idx_queues_project ON queues(project_id);
CREATE TYPE job_status AS ENUM (
    'queued',
    'scheduled',
    'claimed',
    'running',
    'completed',
    'failed',
    'retrying',
    'dead_letter'
);
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status job_status NOT NULL DEFAULT 'queued',
    priority INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    retry_count INT NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    run_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    claimed_by UUID,
    execution_duration_ms INT,
    result JSONB,
    error TEXT,
    cron_expression VARCHAR(100),
    batch_id UUID,
    depends_on UUID[],
    idempotency_key VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_jobs_poll ON jobs(queue_id, status, run_at)
    WHERE status IN ('queued', 'retrying');
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_claimed_by ON jobs(claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX idx_jobs_batch ON jobs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_jobs_cron ON jobs(cron_expression) WHERE cron_expression IS NOT NULL;
CREATE INDEX idx_jobs_queue_created ON jobs(queue_id, created_at DESC);
CREATE INDEX idx_jobs_idempotency ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    version VARCHAR(50) DEFAULT '1.0.0',
    concurrency_limit INT NOT NULL DEFAULT 5,
    active_jobs INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draining', 'offline')),
    queue_ids UUID[] NOT NULL DEFAULT '{}',
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_workers_heartbeat ON workers(last_heartbeat) WHERE status = 'active';
ALTER TABLE jobs ADD CONSTRAINT fk_jobs_claimed_by
    FOREIGN KEY (claimed_by) REFERENCES workers(id) ON DELETE SET NULL;
CREATE TABLE worker_heartbeats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active_jobs INT NOT NULL DEFAULT 0,
    cpu_usage REAL,
    memory_usage REAL
);
CREATE INDEX idx_heartbeats_worker ON worker_heartbeats(worker_id, timestamp DESC);
CREATE TABLE job_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    attempt INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INT,
    error TEXT,
    result JSONB
);
CREATE INDEX idx_executions_job ON job_executions(job_id, attempt);
CREATE INDEX idx_executions_worker ON job_executions(worker_id);
CREATE TABLE job_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES job_executions(id) ON DELETE CASCADE,
    level VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_logs_job ON job_logs(job_id, timestamp DESC);
CREATE INDEX idx_logs_execution ON job_logs(execution_id) WHERE execution_id IS NOT NULL;
CREATE TABLE scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    cron_expression VARCHAR(100) NOT NULL,
    job_type VARCHAR(255) NOT NULL,
    job_payload JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_scheduled_active ON scheduled_jobs(is_active, next_run_at)
    WHERE is_active = TRUE;
CREATE TABLE dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    job_type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    error TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reprocessed BOOLEAN NOT NULL DEFAULT FALSE,
    reprocessed_at TIMESTAMPTZ,
    reprocessed_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL
);
CREATE INDEX idx_dlq_queue ON dead_letter_queue(queue_id);
CREATE INDEX idx_dlq_unprocessed ON dead_letter_queue(reprocessed, failed_at DESC)
    WHERE reprocessed = FALSE;
CREATE TABLE rate_limit_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_size_ms INT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    max_count INT NOT NULL,
    UNIQUE(key, window_start)
);
CREATE INDEX idx_rate_limit_key ON rate_limit_counters(key, window_start DESC);
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_queues_updated_at
    BEFORE UPDATE ON queues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_scheduled_jobs_updated_at
    BEFORE UPDATE ON scheduled_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();