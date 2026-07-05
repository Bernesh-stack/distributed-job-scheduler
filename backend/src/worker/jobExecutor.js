const { query } = require('../db');
const retryService = require('../services/retryService');
class JobExecutor {
  constructor(concurrencyLimit = 5) {
    this.concurrencyLimit = concurrencyLimit;
    this.activeJobs = 0;
    this.isShuttingDown = false;
  }
  get availableSlots() {
    return this.concurrencyLimit - this.activeJobs;
  }
  get isBusy() {
    return this.activeJobs >= this.concurrencyLimit;
  }
  async execute(job, workerId) {
    if (this.isBusy || this.isShuttingDown) {
      return false;
    }
    this.activeJobs++;
    try {
      await query(
        `UPDATE jobs SET status = 'running', started_at = NOW() WHERE id = $1`,
        [job.id]
      );
      const execution = await query(
        `INSERT INTO job_executions (job_id, worker_id, attempt, status, started_at)
         VALUES ($1, $2, $3, 'running', NOW())
         RETURNING id`,
        [job.id, workerId, job.retry_count + 1]
      );
      const executionId = execution.rows[0].id;
      await query(
        `INSERT INTO job_logs (job_id, execution_id, level, message, metadata)
         VALUES ($1, $2, 'info', 'Job execution started', $3)`,
        [job.id, executionId, JSON.stringify({ worker_id: workerId, attempt: job.retry_count + 1 })]
      );
      const startTime = Date.now();
      try {
        const result = await this.executeHandler(job);
        const durationMs = Date.now() - startTime;
        await query(
          `UPDATE jobs SET
            status = 'completed',
            completed_at = NOW(),
            execution_duration_ms = $1,
            result = $2,
            error = NULL
          WHERE id = $3`,
          [durationMs, JSON.stringify(result), job.id]
        );
        await query(
          `UPDATE job_executions SET
            status = 'completed',
            completed_at = NOW(),
            duration_ms = $1,
            result = $2
          WHERE id = $3`,
          [durationMs, JSON.stringify(result), executionId]
        );
        await query(
          `INSERT INTO job_logs (job_id, execution_id, level, message, metadata)
           VALUES ($1, $2, 'info', 'Job completed successfully', $3)`,
          [job.id, executionId, JSON.stringify({ duration_ms: durationMs })]
        );
        return { success: true, duration: durationMs };
      } catch (execError) {
        const durationMs = Date.now() - startTime;
        await query(
          `UPDATE job_executions SET
            status = 'failed',
            completed_at = NOW(),
            duration_ms = $1,
            error = $2
          WHERE id = $3`,
          [durationMs, execError.message, executionId]
        );
        const retryCount = job.retry_count + 1;
        const shouldRetry = retryService.shouldRetry(retryCount, job.max_retries);
        if (shouldRetry) {
          const policyResult = await query(
            `SELECT rp.* FROM retry_policies rp
             JOIN queues q ON q.retry_policy_id = rp.id
             WHERE q.id = $1`,
            [job.queue_id]
          );
          const policy = policyResult.rows[0] || {
            strategy: 'exponential',
            base_delay_ms: 1000,
            max_delay_ms: 60000,
          };
          const nextRunAt = retryService.calculateNextRunAt(policy, retryCount);
          await query(
            `UPDATE jobs SET
              status = 'retrying',
              retry_count = $1,
              run_at = $2,
              error = $3,
              claimed_by = NULL,
              started_at = NULL,
              execution_duration_ms = $4
            WHERE id = $5`,
            [retryCount, nextRunAt, execError.message, durationMs, job.id]
          );
          await query(
            `INSERT INTO job_logs (job_id, execution_id, level, message, metadata)
             VALUES ($1, $2, 'warn', 'Job failed, scheduled for retry', $3)`,
            [job.id, executionId, JSON.stringify({
              retry_count: retryCount,
              max_retries: job.max_retries,
              next_run_at: nextRunAt,
              strategy: policy.strategy,
              error: execError.message,
            })]
          );
        } else {
          await query(
            `UPDATE jobs SET
              status = 'dead_letter',
              retry_count = $1,
              error = $2,
              completed_at = NOW(),
              execution_duration_ms = $3
            WHERE id = $4`,
            [retryCount, execError.message, durationMs, job.id]
          );
          await query(
            `INSERT INTO dead_letter_queue (original_job_id, queue_id, job_type, payload, error, retry_count)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [job.id, job.queue_id, job.type, job.payload, execError.message, retryCount]
          );
          await query(
            `INSERT INTO job_logs (job_id, execution_id, level, message, metadata)
             VALUES ($1, $2, 'error', 'Job permanently failed, moved to Dead Letter Queue', $3)`,
            [job.id, executionId, JSON.stringify({
              retry_count: retryCount,
              max_retries: job.max_retries,
              error: execError.message,
            })]
          );
        }
        return { success: false, error: execError.message, duration: durationMs };
      }
    } finally {
      this.activeJobs--;
      await query(
        'UPDATE workers SET active_jobs = $1 WHERE id = $2',
        [this.activeJobs, workerId]
      ).catch(() => {});
    }
  }
  async executeHandler(job) {
    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    const simulationConfigs = {
      'email_send': { minMs: 100, maxMs: 500, failRate: 0.05 },
      'image_processing': { minMs: 500, maxMs: 2000, failRate: 0.1 },
      'data_indexing': { minMs: 200, maxMs: 1000, failRate: 0.03 },
      'payment_capture': { minMs: 300, maxMs: 800, failRate: 0.15 },
      'media_processing': { minMs: 1000, maxMs: 5000, failRate: 0.08 },
      'report_generation': { minMs: 500, maxMs: 3000, failRate: 0.05 },
      'notification_push': { minMs: 50, maxMs: 200, failRate: 0.02 },
      'legacy_sync': { minMs: 2000, maxMs: 8000, failRate: 0.2 },
    };
    const config = simulationConfigs[job.type] || { minMs: 100, maxMs: 1000, failRate: 0.1 };
    const duration = config.minMs + Math.random() * (config.maxMs - config.minMs);
    await new Promise(resolve => setTimeout(resolve, duration));
    if (Math.random() < config.failRate) {
      const errors = [
        'Connection timeout',
        'Rate limit exceeded',
        'Resource not found',
        'Invalid payload format',
        'Downstream service unavailable',
      ];
      throw new Error(errors[Math.floor(Math.random() * errors.length)]);
    }
    return {
      processed: true,
      type: job.type,
      processedAt: new Date().toISOString(),
      result: `Successfully processed ${job.type} job`,
    };
  }
  shutdown() {
    this.isShuttingDown = true;
  }
}
module.exports = JobExecutor;