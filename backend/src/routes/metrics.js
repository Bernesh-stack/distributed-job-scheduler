const express = require('express');
const metricsService = require('../services/metricsService');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);
router.get('/dashboard', async (req, res, next) => {
  try {
    const stats = await metricsService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});
router.get('/throughput', async (req, res, next) => {
  try {
    const data = await metricsService.getThroughput({
      hours: parseInt(req.query.hours) || 24,
      interval: req.query.interval || '1 hour',
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});
router.get('/success-rate', async (req, res, next) => {
  try {
    const data = await metricsService.getSuccessRate({
      hours: parseInt(req.query.hours) || 24,
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});
router.get('/queue-health', async (req, res, next) => {
  try {
    const data = await metricsService.getQueueHealth();
    res.json(data);
  } catch (error) {
    next(error);
  }
});
router.get('/execution-times', async (req, res, next) => {
  try {
    const data = await metricsService.getExecutionTimes();
    res.json(data);
  } catch (error) {
    next(error);
  }
});
module.exports = router;