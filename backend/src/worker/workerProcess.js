require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { query, pool } = require('../db');
const config = require('../config');
const jobClaimer = require('./jobClaimer');
const JobExecutor = require('./jobExecutor');
const Heartbeat = require('./heartbeat');
const gracefulShutdown = require('./gracefulShutdown');
const os = require('os');
class WorkerProcess {
  constructor(options = {}) {
    this.hostname = options.hostname || os.hostname();
    this.ipAddress = options.ipAddress || '127.0.0.1';
    this.version = options.version || '1.0.0';
    this.concurrencyLimit = options.concurrencyLimit || 5;
    this.queueIds = options.queueIds || [];
    this.pollInterval = options.pollIntervalMs || config.workerPollIntervalMs;
    this.heartbeatInterval = options.heartbeatIntervalMs || config.heartbeatIntervalMs;
    this.workerId = null;
    this.executor = new JobExecutor(this.concurrencyLimit);
    this.heartbeat = null;
    this.pollTimer = null;
    this.isRunning = false;
  }
  async start() {
    console.log(`\n🔧 Worker starting on ${this.hostname}`);
    console.log(`   Concurrency: ${this.concurrencyLimit}`);
    console.log(`   Poll interval: ${this.pollInterval}ms`);
    console.log(`   Heartbeat interval: ${this.heartbeatInterval}ms\n`);
    const result = await query(
      `INSERT INTO workers (hostname, ip_address, version, concurrency_limit, queue_ids, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id`,
      [this.hostname, this.ipAddress, this.version, this.concurrencyLimit, this.queueIds]
    );
    this.workerId = result.rows[0].id;
    console.log(`[WORKER] Registered with ID: ${this.workerId}`);
    if (this.queueIds.length === 0) {
      const queues = await query(
        "SELECT id FROM queues WHERE is_paused = FALSE"
      );
      this.queueIds = queues.rows.map(q => q.id);
      await query(
        'UPDATE workers SET queue_ids = $1 WHERE id = $2',
        [this.queueIds, this.workerId]
      );
    }
    if (this.queueIds.length === 0) {
      console.log('[WORKER] No queues available to poll. Waiting...');
    }
    this.heartbeat = new Heartbeat(this.workerId, this.heartbeatInterval);
    this.heartbeat.start(() => this.executor.activeJobs);
    gracefulShutdown.init();
    gracefulShutdown.onShutdown(async () => {
      await this.shutdown();
    });
    this.isRunning = true;
    this.poll();
  }
  async poll() {
    if (!this.isRunning) return;
    try {
      if (this.queueIds.length === 0) {
        const queues = await query("SELECT id FROM queues WHERE is_paused = FALSE");
        this.queueIds = queues.rows.map(q => q.id);
      }
      while (this.executor.availableSlots > 0 && this.queueIds.length > 0 && this.isRunning) {
        const job = await jobClaimer.claimJob(this.queueIds, this.workerId);
        if (!job) break;
        console.log(`[WORKER] Claimed job ${job.id} (type: ${job.type}, queue: ${job.queue_id})`);
        this.executor.execute(job, this.workerId)
          .then(result => {
            if (result.success) {
              console.log(`[WORKER] ✓ Job ${job.id} completed in ${result.duration}ms`);
            } else {
              console.log(`[WORKER] ✗ Job ${job.id} failed: ${result.error}`);
            }
          })
          .catch(error => {
            console.error(`[WORKER] Error executing job ${job.id}:`, error.message);
          });
      }
    } catch (error) {
      console.error('[WORKER] Poll error:', error.message);
    }
    if (this.isRunning) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
    }
  }
  async shutdown() {
    console.log('[WORKER] Initiating graceful shutdown...');
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.executor.shutdown();
    if (this.heartbeat) {
      this.heartbeat.stop();
    }
    const maxWaitMs = 30000;
    const startWait = Date.now();
    while (this.executor.activeJobs > 0 && (Date.now() - startWait) < maxWaitMs) {
      console.log(`[WORKER] Waiting for ${this.executor.activeJobs} in-flight jobs...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (this.executor.activeJobs > 0) {
      console.warn(`[WORKER] Force shutting down with ${this.executor.activeJobs} jobs still running`);
    }
    if (this.workerId) {
      await query(
        "UPDATE workers SET status = 'offline', active_jobs = 0 WHERE id = $1",
        [this.workerId]
      ).catch(() => {});
    }
    await pool.end().catch(() => {});
    console.log('[WORKER] Shutdown complete');
  }
}
if (require.main === module) {
  const worker = new WorkerProcess({
    concurrencyLimit: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  });
  worker.start().catch(err => {
    console.error('Failed to start worker:', err);
    process.exit(1);
  });
}
module.exports = WorkerProcess;