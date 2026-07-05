const { query, withTransaction } = require('../db');
const config = require('../config');
async function reconcileStaleWorkers() {
  try {
    const timeoutMs = config.staleHeartbeatTimeoutMs;
    const staleWorkers = await query(
      `SELECT id, hostname FROM workers
       WHERE status = 'active'
         AND last_heartbeat < NOW() - INTERVAL '${timeoutMs} milliseconds'`
    );
    for (const worker of staleWorkers.rows) {
      console.log(`[RECONCILER] Worker ${worker.hostname} (${worker.id}) is stale, requeuing jobs...`);
      await withTransaction(async (client) => {
        const requeued = await client.query(
          `UPDATE jobs SET
            status = 'queued',
            claimed_by = NULL,
            started_at = NULL,
            error = 'Worker went stale, job requeued'
          WHERE claimed_by = $1 AND status IN ('claimed', 'running')
          RETURNING id`,
          [worker.id]
        );
        await client.query(
          `UPDATE workers SET status = 'offline', active_jobs = 0 WHERE id = $1`,
          [worker.id]
        );
        if (requeued.rows.length > 0) {
          console.log(`[RECONCILER] Requeued ${requeued.rows.length} jobs from stale worker ${worker.hostname}`);
          for (const job of requeued.rows) {
            await client.query(
              `INSERT INTO job_logs (job_id, level, message, metadata)
               VALUES ($1, 'warn', 'Job requeued due to stale worker', $2)`,
              [job.id, JSON.stringify({ worker_id: worker.id, worker_hostname: worker.hostname })]
            );
          }
        }
      });
    }
  } catch (error) {
    console.error('[RECONCILER] Error reconciling stale workers:', error.message);
  }
}
let reconcilerInterval = null;
function startReconciler() {
  console.log(`[RECONCILER] Starting stale worker reconciler (interval: ${config.reconcilerIntervalMs}ms)`);
  reconcilerInterval = setInterval(reconcileStaleWorkers, config.reconcilerIntervalMs);
  reconcileStaleWorkers();
}
function stopReconciler() {
  if (reconcilerInterval) {
    clearInterval(reconcilerInterval);
    reconcilerInterval = null;
    console.log('[RECONCILER] Stopped');
  }
}
module.exports = { startReconciler, stopReconciler, reconcileStaleWorkers };