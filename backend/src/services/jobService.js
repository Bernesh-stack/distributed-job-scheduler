const { query, withTransaction } = require('../db');
const { AppError } = require('../middleware/errorHandler');
const config = require('../config');
const cronParser = require('cron-parser');
class JobService {
  async create({ queueId, type, payload, priority, scheduledAt, cronExpression, batchId, idempotencyKey, maxRetries }) {
    if (idempotencyKey) {
      const existing = await query(
        'SELECT * FROM jobs WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }
    }
    const queueResult = await query(
      `SELECT q.*, rp.max_retries as policy_max_retries
       FROM queues q LEFT JOIN retry_policies rp ON q.retry_policy_id = rp.id
       WHERE q.id = $1`,
      [queueId]
    );
    if (queueResult.rows.length === 0) {
      throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
    }
    const queue = queueResult.rows[0];
    if (queue.is_paused) {
      throw new AppError('Queue is paused', 400, 'QUEUE_PAUSED');
    }
    const effectiveMaxRetries = maxRetries ?? queue.policy_max_retries ?? 3;
    let status = 'queued';
    let runAt = null;
    if (cronExpression) {
      const interval = cronParser.parseExpression(cronExpression);
      runAt = interval.next().toDate();
      status = 'scheduled';
      await query(
        `INSERT INTO scheduled_jobs (queue_id, name, cron_expression, job_type, job_payload, next_run_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [queueId, `${type}-cron`, cronExpression, type, payload, runAt]
      );
    } else if (scheduledAt) {
      const schedDate = new Date(scheduledAt);
      if (schedDate > new Date()) {
        status = 'scheduled';
        runAt = schedDate;
      }
    }
    const result = await query(
      `INSERT INTO jobs (queue_id, type, payload, status, priority, max_retries, scheduled_at, run_at, cron_expression, batch_id, idempotency_key)
       VALUES ($1, $2, $3, $4::job_status, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [queueId, type, JSON.stringify(payload), status, priority || 0, effectiveMaxRetries, scheduledAt || null, runAt, cronExpression || null, batchId || null, idempotencyKey || null]
    );
    await query(
      `INSERT INTO job_logs (job_id, level, message, metadata)
       VALUES ($1, 'info', 'Job created', $2)`,
      [result.rows[0].id, JSON.stringify({ status, type })]
    );
    return result.rows[0];
  }
  async createBatch({ queueId, jobs }) {
    const { v4: uuidv4 } = require('uuid');
    const batchId = uuidv4();
    const results = [];
    for (const job of jobs) {
      const result = await this.create({
        queueId,
        ...job,
        batchId,
      });
      results.push(result);
    }
    return { batchId, jobs: results, count: results.length };
  }
  async list({ queueId, status, type, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC' }) {
    limit = Math.min(limit, config.maxPageSize);
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    if (queueId) {
      conditions.push(`j.queue_id = $${paramIndex++}`);
      params.push(queueId);
    }
    if (status) {
      conditions.push(`j.status = $${paramIndex++}::job_status`);
      params.push(status);
    }
    if (type) {
      conditions.push(`j.type ILIKE $${paramIndex++}`);
      params.push(`%${type}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const validSortColumns = ['created_at', 'priority', 'status', 'scheduled_at', 'started_at'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const countResult = await query(
      `SELECT COUNT(*) FROM jobs j ${whereClause}`,
      params
    );
    const result = await query(
      `SELECT j.*, q.name as queue_name
       FROM jobs j
       LEFT JOIN queues q ON j.queue_id = q.id
       ${whereClause}
       ORDER BY j.${safeSortBy} ${safeSortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );
    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit),
      },
    };
  }
  async getById(id) {
    const result = await query(
      `SELECT j.*, q.name as queue_name
       FROM jobs j
       LEFT JOIN queues q ON j.queue_id = q.id
       WHERE j.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    const executions = await query(
      `SELECT * FROM job_executions WHERE job_id = $1 ORDER BY attempt ASC`,
      [id]
    );
    return {
      ...result.rows[0],
      executions: executions.rows,
    };
  }
  async retry(id) {
    const job = await this.getById(id);
    if (!['failed', 'dead_letter'].includes(job.status)) {
      throw new AppError('Only failed or dead_letter jobs can be retried', 400, 'INVALID_STATUS');
    }
    const result = await query(
      `UPDATE jobs SET status = 'queued', retry_count = 0, run_at = NULL,
       claimed_by = NULL, error = NULL, started_at = NULL, completed_at = NULL
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (job.status === 'dead_letter') {
      await query(
        `UPDATE dead_letter_queue SET reprocessed = TRUE, reprocessed_at = NOW(), reprocessed_job_id = $1
         WHERE original_job_id = $1 AND reprocessed = FALSE`,
        [id]
      );
    }
    await query(
      `INSERT INTO job_logs (job_id, level, message) VALUES ($1, 'info', 'Job manually retried')`,
      [id]
    );
    return result.rows[0];
  }
  async cancel(id) {
    const job = await this.getById(id);
    if (!['queued', 'scheduled'].includes(job.status)) {
      throw new AppError('Only queued or scheduled jobs can be cancelled', 400, 'INVALID_STATUS');
    }
    const result = await query(
      `UPDATE jobs SET status = 'failed', error = 'Cancelled by user', completed_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    await query(
      `INSERT INTO job_logs (job_id, level, message) VALUES ($1, 'info', 'Job cancelled by user')`,
      [id]
    );
    return result.rows[0];
  }
  async getLogs(jobId, { page = 1, limit = 50 }) {
    limit = Math.min(limit, config.maxPageSize);
    const offset = (page - 1) * limit;
    const countResult = await query(
      'SELECT COUNT(*) FROM job_logs WHERE job_id = $1',
      [jobId]
    );
    const result = await query(
      `SELECT * FROM job_logs WHERE job_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3`,
      [jobId, limit, offset]
    );
    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit),
      },
    };
  }
}
module.exports = new JobService();