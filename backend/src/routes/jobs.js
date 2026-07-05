const express = require('express');
const Joi = require('joi');
const jobService = require('../services/jobService');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const router = express.Router({ mergeParams: true });
router.use(authenticate);
const createJobSchema = Joi.object({
  type: Joi.string().min(1).max(255).required(),
  payload: Joi.object().default({}),
  priority: Joi.number().integer().min(0).max(100).default(0),
  scheduledAt: Joi.string().isoDate().allow(null),
  cronExpression: Joi.string().max(100).allow(null, ''),
  idempotencyKey: Joi.string().max(255).allow(null, ''),
  maxRetries: Joi.number().integer().min(0).max(20).allow(null),
});
const createBatchSchema = Joi.object({
  jobs: Joi.array().items(
    Joi.object({
      type: Joi.string().min(1).max(255).required(),
      payload: Joi.object().default({}),
      priority: Joi.number().integer().min(0).max(100).default(0),
      scheduledAt: Joi.string().isoDate().allow(null),
      maxRetries: Joi.number().integer().min(0).max(20).allow(null),
    })
  ).min(1).max(100).required(),
});
const listJobsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'retrying', 'dead_letter').allow(null, ''),
  type: Joi.string().max(255).allow(null, ''),
  sortBy: Joi.string().valid('created_at', 'priority', 'status', 'scheduled_at', 'started_at').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC'),
});
router.post('/', validate(createJobSchema), async (req, res, next) => {
  try {
    const job = await jobService.create({
      queueId: req.params.queueId,
      ...req.body,
    });
    res.status(201).json(job);
  } catch (error) {
    next(error);
  }
});
router.post('/batch', validate(createBatchSchema), async (req, res, next) => {
  try {
    const result = await jobService.createBatch({
      queueId: req.params.queueId,
      jobs: req.body.jobs,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
router.get('/', validate(listJobsSchema, 'query'), async (req, res, next) => {
  try {
    const result = await jobService.list({
      queueId: req.params.queueId,
      ...req.query,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.get('/all', validate(listJobsSchema, 'query'), async (req, res, next) => {
  try {
    const result = await jobService.list(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.get('/:id', async (req, res, next) => {
  try {
    const job = await jobService.getById(req.params.id);
    res.json(job);
  } catch (error) {
    next(error);
  }
});
router.post('/:id/retry', async (req, res, next) => {
  try {
    const job = await jobService.retry(req.params.id);
    res.json(job);
  } catch (error) {
    next(error);
  }
});
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const job = await jobService.cancel(req.params.id);
    res.json(job);
  } catch (error) {
    next(error);
  }
});
router.get('/:id/logs', async (req, res, next) => {
  try {
    const logs = await jobService.getLogs(req.params.id, {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    res.json(logs);
  } catch (error) {
    next(error);
  }
});
module.exports = router;