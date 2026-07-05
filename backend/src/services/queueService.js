const { query } = require('../db');
const { AppError } = require('../middleware/errorHandler');
const config = require('../config');
class QueueService {
  async create({ projectId, name, priority, concurrencyLimit, retryPolicyId, rateLimitMax, rateLimitWindowMs }) {
    const result = await query(
      `INSERT INTO queues (project_id, name, priority, concurrency_limit, retry_policy_id, rate_limit_max, rate_limit_window_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [projectId, name, priority || 10, concurrencyLimit || 10, retryPolicyId || null, rateLimitMax || null, rateLimitWindowMs || null]
    );
    return result.rows[0];
  }
  async list({ projectId, page = 1, limit = 20, includeStats = true }) {
    limit = Math.min(limit, config.maxPageSize);
    const offset = (page - 1) * limit;
    const countResult = await query(
      'SELECT COUNT(*) FROM queues WHERE project_id = $1',
      [projectId]
    );
    let queryText;
    if (includeStats) {
      queryText = `
        SELECT q.*,
          rp.name as retry_policy_name, rp.strategy as retry_strategy,
          (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'queued') as pending_count,
          (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'running') as running_count,
          (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'failed') as failed_count,
          (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'completed') as completed_count,
          (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'dead_letter') as dead_letter_count,
          (SELECT AVG(j.execution_duration_ms) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'completed' AND j.execution_duration_ms IS NOT NULL) as avg_execution_ms
        FROM queues q
        LEFT JOIN retry_policies rp ON q.retry_policy_id = rp.id
        WHERE q.project_id = $1
        ORDER BY q.priority DESC, q.created_at ASC
        LIMIT $2 OFFSET $3`;
    } else {
      queryText = `
        SELECT q.*, rp.name as retry_policy_name, rp.strategy as retry_strategy
        FROM queues q
        LEFT JOIN retry_policies rp ON q.retry_policy_id = rp.id
        WHERE q.project_id = $1
        ORDER BY q.priority DESC, q.created_at ASC
        LIMIT $2 OFFSET $3`;
    }
    const result = await query(queryText, [projectId, limit, offset]);
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
      `SELECT q.*,
        rp.name as retry_policy_name, rp.strategy as retry_strategy,
        rp.max_retries as policy_max_retries, rp.base_delay_ms, rp.max_delay_ms,
        (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'queued') as pending_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'running') as running_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'failed') as failed_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.queue_id = q.id AND j.status = 'completed') as completed_count
      FROM queues q
      LEFT JOIN retry_policies rp ON q.retry_policy_id = rp.id
      WHERE q.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
    }
    return result.rows[0];
  }
  async update(id, { name, priority, concurrencyLimit, retryPolicyId, rateLimitMax, rateLimitWindowMs }) {
    const result = await query(
      `UPDATE queues SET
        name = COALESCE($1, name),
        priority = COALESCE($2, priority),
        concurrency_limit = COALESCE($3, concurrency_limit),
        retry_policy_id = COALESCE($4, retry_policy_id),
        rate_limit_max = COALESCE($5, rate_limit_max),
        rate_limit_window_ms = COALESCE($6, rate_limit_window_ms)
      WHERE id = $7 RETURNING *`,
      [name, priority, concurrencyLimit, retryPolicyId, rateLimitMax, rateLimitWindowMs, id]
    );
    if (result.rows.length === 0) {
      throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
    }
    return result.rows[0];
  }
  async pause(id) {
    const result = await query(
      'UPDATE queues SET is_paused = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
    }
    return result.rows[0];
  }
  async resume(id) {
    const result = await query(
      'UPDATE queues SET is_paused = FALSE WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
    }
    return result.rows[0];
  }
  async delete(id) {
    const result = await query('DELETE FROM queues WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
    }
    return { deleted: true };
  }
  async getRetryPolicies() {
    const result = await query('SELECT * FROM retry_policies ORDER BY name');
    return result.rows;
  }
}
module.exports = new QueueService();