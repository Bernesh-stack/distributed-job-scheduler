const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const queueRoutes = require('./routes/queues');
const jobRoutes = require('./routes/jobs');
const workerRoutes = require('./routes/workers');
const dlqRoutes = require('./routes/dlq');
const metricsRoutes = require('./routes/metrics');
const { startReconciler } = require('./reconciler/staleWorkerReconciler');
const { startScheduledJobProcessor } = require('./reconciler/scheduledJobProcessor');
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000'];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects/:projectId/queues', queueRoutes);
app.use('/api/queues/:queueId/jobs', jobRoutes);
app.get('/api/jobs', authenticate, async (req, res, next) => {
  try {
    const jobService = require('./services/jobService');
    const result = await jobService.list({
      status: req.query.status || null,
      type: req.query.type || null,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      sortBy: req.query.sortBy || 'created_at',
      sortOrder: req.query.sortOrder || 'DESC',
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
app.get('/api/jobs/:id', authenticate, async (req, res, next) => {
  try {
    const jobService = require('./services/jobService');
    const job = await jobService.getById(req.params.id);
    res.json(job);
  } catch (error) {
    next(error);
  }
});
app.post('/api/jobs/:id/retry', authenticate, async (req, res, next) => {
  try {
    const jobService = require('./services/jobService');
    const job = await jobService.retry(req.params.id);
    res.json(job);
  } catch (error) {
    next(error);
  }
});
app.get('/api/jobs/:id/logs', authenticate, async (req, res, next) => {
  try {
    const jobService = require('./services/jobService');
    const logs = await jobService.getLogs(req.params.id, {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    res.json(logs);
  } catch (error) {
    next(error);
  }
});
app.use('/api/workers', workerRoutes);
app.use('/api/dlq', dlqRoutes);
app.use('/api/metrics', metricsRoutes);
app.get('/api/retry-policies', authenticate, async (req, res, next) => {
  try {
    const queueService = require('./services/queueService');
    const policies = await queueService.getRetryPolicies();
    res.json(policies);
  } catch (error) {
    next(error);
  }
});
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    details: `${req.method} ${req.path} does not exist`,
  });
});
app.use(errorHandler);
const server = app.listen(config.port, () => {
  console.log(`\n🚀 Job Scheduler API running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Health: http://localhost:${config.port}/api/health\n`);
  startReconciler();
  startScheduledJobProcessor();
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
module.exports = app;