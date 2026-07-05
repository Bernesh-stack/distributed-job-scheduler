require('dotenv').config();
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  nodeEnv: process.env.NODE_ENV || 'development',
  workerPollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000', 10),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '5000', 10),
  staleHeartbeatTimeoutMs: parseInt(process.env.STALE_HEARTBEAT_TIMEOUT_MS || '30000', 10),
  reconcilerIntervalMs: parseInt(process.env.RECONCILER_INTERVAL_MS || '15000', 10),
  defaultPageSize: 20,
  maxPageSize: 100,
};
module.exports = config;