const { getClient } = require('../db');
class JobClaimer {
  async claimJob(queueIds, workerId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT id, queue_id, type, payload, max_retries, retry_count, priority
         FROM jobs
         WHERE queue_id = ANY($1)
           AND status IN ('queued', 'retrying')
           AND (run_at IS NULL OR run_at <= NOW())
         ORDER BY priority DESC, created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [queueIds]
      );
      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return null;
      }
      const job = result.rows[0];
      await client.query(
        `UPDATE jobs
         SET status = 'claimed',
             claimed_by = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [workerId, job.id]
      );
      await client.query('COMMIT');
      return job;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async claimJobs(queueIds, workerId, count = 1) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT id, queue_id, type, payload, max_retries, retry_count, priority
         FROM jobs
         WHERE queue_id = ANY($1)
           AND status IN ('queued', 'retrying')
           AND (run_at IS NULL OR run_at <= NOW())
         ORDER BY priority DESC, created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED`,
        [queueIds, count]
      );
      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return [];
      }
      const jobIds = result.rows.map(j => j.id);
      await client.query(
        `UPDATE jobs
         SET status = 'claimed',
             claimed_by = $1,
             updated_at = NOW()
         WHERE id = ANY($2)`,
        [workerId, jobIds]
      );
      await client.query('COMMIT');
      return result.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
module.exports = new JobClaimer();