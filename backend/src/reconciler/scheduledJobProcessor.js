const { query } = require('../db');
const cronParser = require('cron-parser');
async function processScheduledJobs() {
  try {
    const promoted = await query(
      `UPDATE jobs SET status = 'queued'
       WHERE status = 'scheduled'
         AND run_at IS NOT NULL
         AND run_at <= NOW()
         AND cron_expression IS NULL
       RETURNING id`
    );
    if (promoted.rows.length > 0) {
      console.log(`[SCHEDULER] Promoted ${promoted.rows.length} scheduled jobs to queued`);
    }
    const cronJobs = await query(
      `SELECT * FROM scheduled_jobs
       WHERE is_active = TRUE
         AND next_run_at IS NOT NULL
         AND next_run_at <= NOW()`
    );
    for (const cronJob of cronJobs.rows) {
      try {
        await query(
          `INSERT INTO jobs (queue_id, type, payload, status, priority)
           VALUES ($1, $2, $3, 'queued', 0)`,
          [cronJob.queue_id, cronJob.job_type, cronJob.job_payload]
        );
        const interval = cronParser.parseExpression(cronJob.cron_expression);
        const nextRun = interval.next().toDate();
        await query(
          `UPDATE scheduled_jobs SET last_run_at = NOW(), next_run_at = $1 WHERE id = $2`,
          [nextRun, cronJob.id]
        );
        console.log(`[SCHEDULER] Created cron job instance for ${cronJob.name}, next run: ${nextRun}`);
      } catch (err) {
        console.error(`[SCHEDULER] Error processing cron job ${cronJob.id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[SCHEDULER] Error processing scheduled jobs:', error.message);
  }
}
let schedulerInterval = null;
function startScheduledJobProcessor() {
  console.log('[SCHEDULER] Starting scheduled job processor (interval: 5000ms)');
  schedulerInterval = setInterval(processScheduledJobs, 5000);
  processScheduledJobs();
}
function stopScheduledJobProcessor() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
module.exports = { startScheduledJobProcessor, stopScheduledJobProcessor, processScheduledJobs };