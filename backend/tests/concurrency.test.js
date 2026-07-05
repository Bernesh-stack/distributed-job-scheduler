import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool, query, getClient } = require('../src/db');
const jobClaimer = require('../src/worker/jobClaimer');
describe('Atomic Job Claiming — Concurrency Test', () => {
  let testQueueId;
  let testProjectId;
  let testOrgId;
  let testUserId;
  const workerIds = [];
  const NUM_JOBS = 20;
  const NUM_WORKERS = 10;
  beforeAll(async () => {
    const userResult = await query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('concurrency-test@test.com', 'hash', 'Test User', 'admin')
       ON CONFLICT (email) DO UPDATE SET name = 'Test User'
       RETURNING id`
    );
    testUserId = userResult.rows[0].id;
    const orgResult = await query(
      `INSERT INTO organizations (name, owner_id)
       VALUES ('Test Org', $1)
       RETURNING id`,
      [testUserId]
    );
    testOrgId = orgResult.rows[0].id;
    const projResult = await query(
      `INSERT INTO projects (name, org_id, created_by)
       VALUES ('Concurrency Test Project', $1, $2)
       RETURNING id`,
      [testOrgId, testUserId]
    );
    testProjectId = projResult.rows[0].id;
    const queueResult = await query(
      `INSERT INTO queues (project_id, name, concurrency_limit)
       VALUES ($1, 'concurrency-test-queue', 100)
       RETURNING id`,
      [testProjectId]
    );
    testQueueId = queueResult.rows[0].id;
    for (let i = 0; i < NUM_WORKERS; i++) {
      const workerResult = await query(
        `INSERT INTO workers (hostname, concurrency_limit, queue_ids, status)
         VALUES ($1, 10, $2, 'active')
         RETURNING id`,
        [`test-worker-${i}`, [testQueueId]]
      );
      workerIds.push(workerResult.rows[0].id);
    }
  });
  afterAll(async () => {
    await query('DELETE FROM jobs WHERE queue_id = $1', [testQueueId]);
    await query('DELETE FROM queues WHERE id = $1', [testQueueId]);
    await query('DELETE FROM workers WHERE hostname LIKE $1', ['test-worker-%']);
    await query('DELETE FROM projects WHERE id = $1', [testProjectId]);
    await query('DELETE FROM organizations WHERE id = $1', [testOrgId]);
    await query('DELETE FROM users WHERE email = $1', ['concurrency-test@test.com']);
    await pool.end();
  });
  it('should never allow two workers to claim the same job', async () => {
    for (let i = 0; i < NUM_JOBS; i++) {
      await query(
        `INSERT INTO jobs (queue_id, type, payload, status, priority)
         VALUES ($1, 'test-job', '{"index": ${i}}', 'queued', ${i})`,
        [testQueueId]
      );
    }
    const queuedCount = await query(
      "SELECT COUNT(*) FROM jobs WHERE queue_id = $1 AND status = 'queued'",
      [testQueueId]
    );
    expect(parseInt(queuedCount.rows[0].count)).toBe(NUM_JOBS);
    const claimResults = [];
    const claimPromises = workerIds.map(async (workerId) => {
      const claimed = [];
      for (let attempt = 0; attempt < NUM_JOBS; attempt++) {
        const job = await jobClaimer.claimJob([testQueueId], workerId);
        if (job) {
          claimed.push({ jobId: job.id, workerId });
        }
      }
      return claimed;
    });
    const allResults = await Promise.all(claimPromises);
    allResults.forEach(workerClaims => claimResults.push(...workerClaims));
    expect(claimResults.length).toBe(NUM_JOBS);
    const jobIdCounts = {};
    for (const result of claimResults) {
      jobIdCounts[result.jobId] = (jobIdCounts[result.jobId] || 0) + 1;
    }
    for (const [jobId, count] of Object.entries(jobIdCounts)) {
      expect(count).toBe(1);
    }
    const claimedJobs = await query(
      "SELECT id, claimed_by, status FROM jobs WHERE queue_id = $1 AND status = 'claimed'",
      [testQueueId]
    );
    expect(claimedJobs.rows.length).toBe(NUM_JOBS);
    const dbClaimers = new Set(claimedJobs.rows.map(j => `${j.id}:${j.claimed_by}`));
    expect(dbClaimers.size).toBe(NUM_JOBS);
    console.log(`✓ ${NUM_JOBS} jobs claimed by ${NUM_WORKERS} concurrent workers — no duplicates!`);
    console.log(`  Worker distribution:`, workerIds.map((wid, i) =>
      `worker-${i}: ${allResults[i].length} jobs`
    ).join(', '));
  });
  it('should handle batch claiming without duplicates', async () => {
    const BATCH_JOBS = 15;
    for (let i = 0; i < BATCH_JOBS; i++) {
      await query(
        `INSERT INTO jobs (queue_id, type, payload, status, priority)
         VALUES ($1, 'batch-test-job', '{"batch_index": ${i}}', 'queued', 0)`,
        [testQueueId]
      );
    }
    const batchClaimPromises = workerIds.slice(0, 5).map(async (workerId) => {
      return jobClaimer.claimJobs([testQueueId], workerId, 5);
    });
    const batchResults = await Promise.all(batchClaimPromises);
    const allClaimed = batchResults.flat();
    const batchJobIds = allClaimed.map(j => j.id);
    const uniqueIds = new Set(batchJobIds);
    expect(uniqueIds.size).toBe(batchJobIds.length);
    expect(allClaimed.length).toBe(BATCH_JOBS);
    console.log(`✓ Batch claiming: ${BATCH_JOBS} jobs claimed across 5 workers — no duplicates!`);
  });
});