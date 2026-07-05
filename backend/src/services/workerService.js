const { query } = require('../db');
const { AppError } = require('../middleware/errorHandler');
const config = require('../config');
class WorkerService {
  async list({ page = 1, limit = 20, status }) {
    limit = Math.min(limit, config.maxPageSize);
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    if (status) {
      conditions.push(`w.status = $${paramIndex++}`);
      params.push(status);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await query(
      `SELECT COUNT(*) FROM workers w ${whereClause}`,
      params
    );
    const result = await query(
      `SELECT w.*,
        (SELECT COUNT(*) FROM jobs j WHERE j.claimed_by = w.id AND j.status IN ('claimed', 'running')) as current_jobs
       FROM workers w
       ${whereClause}
       ORDER BY w.status ASC, w.last_heartbeat DESC
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
      `SELECT w.*,
        (SELECT COUNT(*) FROM jobs j WHERE j.claimed_by = w.id AND j.status IN ('claimed', 'running')) as current_jobs
       FROM workers w WHERE w.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      throw new AppError('Worker not found', 404, 'WORKER_NOT_FOUND');
    }
    return result.rows[0];
  }
  async getHeartbeats(workerId, { page = 1, limit = 50 }) {
    limit = Math.min(limit, config.maxPageSize);
    const offset = (page - 1) * limit;
    const countResult = await query(
      'SELECT COUNT(*) FROM worker_heartbeats WHERE worker_id = $1',
      [workerId]
    );
    const result = await query(
      `SELECT * FROM worker_heartbeats WHERE worker_id = $1
       ORDER BY timestamp DESC LIMIT $2 OFFSET $3`,
      [workerId, limit, offset]
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
  async getStats() {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COUNT(*) FILTER (WHERE status = 'draining') as draining_count,
        COUNT(*) FILTER (WHERE status = 'offline') as offline_count,
        COUNT(*) as total_count,
        SUM(active_jobs) FILTER (WHERE status = 'active') as total_active_jobs,
        SUM(concurrency_limit) FILTER (WHERE status = 'active') as total_capacity
      FROM workers
    `);
    return result.rows[0];
  }
}
module.exports = new WorkerService();