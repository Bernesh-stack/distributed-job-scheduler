const { query } = require('../db');
const config = require('../config');
class MetricsService {
  async getThroughput({ hours = 24, interval = '1 hour' }) {
    const result = await query(`
      SELECT
        date_trunc($1, completed_at) as time_bucket,
        COUNT(*) as completed_count,
        COUNT(*) FILTER (WHERE status = 'completed') as success_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failure_count
      FROM jobs
      WHERE completed_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
        AND completed_at IS NOT NULL
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `, [interval === '1 hour' ? 'hour' : 'minute']);
    return result.rows;
  }
  async getSuccessRate({ hours = 24 }) {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as successful,
        COUNT(*) FILTER (WHERE status = 'failed' OR status = 'dead_letter') as failed,
        COUNT(*) FILTER (WHERE status = 'retrying') as retrying,
        COUNT(*) as total
      FROM jobs
      WHERE created_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
    `);
    const row = result.rows[0];
    const total = parseInt(row.total) || 1;
    return {
      successful: parseInt(row.successful),
      failed: parseInt(row.failed),
      retrying: parseInt(row.retrying),
      total: parseInt(row.total),
      successRate: ((parseInt(row.successful) / total) * 100).toFixed(1),
    };
  }
  async getQueueHealth() {
    const result = await query(`
      SELECT
        q.id, q.name, q.is_paused, q.concurrency_limit,
        COUNT(j.id) FILTER (WHERE j.status = 'queued') as pending,
        COUNT(j.id) FILTER (WHERE j.status = 'running') as running,
        COUNT(j.id) FILTER (WHERE j.status = 'failed') as failed,
        COUNT(j.id) FILTER (WHERE j.status = 'completed') as completed,
        AVG(j.execution_duration_ms) FILTER (WHERE j.status = 'completed') as avg_duration_ms,
        COUNT(DISTINCT j.claimed_by) FILTER (WHERE j.status = 'running') as active_workers,
        CASE
          WHEN q.is_paused THEN 'paused'
          WHEN COUNT(j.id) FILTER (WHERE j.status = 'failed') > 10 THEN 'degraded'
          ELSE 'healthy'
        END as health_status
      FROM queues q
      LEFT JOIN jobs j ON j.queue_id = q.id AND j.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY q.id
      ORDER BY q.priority DESC
    `);
    return result.rows;
  }
  async getExecutionTimes() {
    const result = await query(`
      SELECT
        q.name as queue_name,
        AVG(j.execution_duration_ms) as avg_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY j.execution_duration_ms) as p50_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY j.execution_duration_ms) as p95_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY j.execution_duration_ms) as p99_ms,
        COUNT(*) as sample_count
      FROM jobs j
      JOIN queues q ON j.queue_id = q.id
      WHERE j.status = 'completed'
        AND j.execution_duration_ms IS NOT NULL
        AND j.completed_at >= NOW() - INTERVAL '24 hours'
      GROUP BY q.name
      ORDER BY avg_ms DESC
    `);
    return result.rows;
  }
  async getDashboardStats() {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM jobs WHERE completed_at >= NOW() - INTERVAL '24 hours') as total_processed_24h,
        (SELECT COUNT(*) FROM jobs WHERE status = 'queued') as current_backlog,
        (SELECT AVG(execution_duration_ms) FROM jobs WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '24 hours') as avg_exec_time_ms,
        (SELECT COUNT(*) FROM workers WHERE status = 'active') as active_workers,
        (SELECT COUNT(*) FROM jobs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') as failures_24h
    `);
    return result.rows[0];
  }
}
module.exports = new MetricsService();