const { query } = require('../db');
class Heartbeat {
  constructor(workerId, intervalMs = 5000) {
    this.workerId = workerId;
    this.intervalMs = intervalMs;
    this.interval = null;
    this.activeJobs = 0;
  }
  start(getActiveJobs) {
    console.log(`[HEARTBEAT] Starting heartbeat for worker ${this.workerId} (interval: ${this.intervalMs}ms)`);
    this.interval = setInterval(async () => {
      try {
        const activeJobs = getActiveJobs ? getActiveJobs() : this.activeJobs;
        await query(
          'UPDATE workers SET last_heartbeat = NOW(), active_jobs = $1 WHERE id = $2',
          [activeJobs, this.workerId]
        );
        const memUsage = process.memoryUsage();
        await query(
          `INSERT INTO worker_heartbeats (worker_id, active_jobs, cpu_usage, memory_usage)
           VALUES ($1, $2, $3, $4)`,
          [
            this.workerId,
            activeJobs,
            0,
            Math.round(memUsage.heapUsed / 1024 / 1024),
          ]
        );
      } catch (error) {
        console.error('[HEARTBEAT] Error sending heartbeat:', error.message);
      }
    }, this.intervalMs);
    this.sendOnce(getActiveJobs);
  }
  async sendOnce(getActiveJobs) {
    try {
      const activeJobs = getActiveJobs ? getActiveJobs() : this.activeJobs;
      await query(
        'UPDATE workers SET last_heartbeat = NOW(), active_jobs = $1 WHERE id = $2',
        [activeJobs, this.workerId]
      );
    } catch (error) {
      console.error('[HEARTBEAT] Error sending initial heartbeat:', error.message);
    }
  }
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log(`[HEARTBEAT] Stopped for worker ${this.workerId}`);
    }
  }
}
module.exports = Heartbeat;