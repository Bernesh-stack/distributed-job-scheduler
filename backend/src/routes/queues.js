const express = require('express');
const Joi = require('joi');
const queueService = require('../services/queueService');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const router = express.Router({ mergeParams: true });
router.use(authenticate);
const createSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  priority: Joi.number().integer().min(1).max(100).default(10),
  concurrencyLimit: Joi.number().integer().min(1).max(1000).default(10),
  retryPolicyId: Joi.string().uuid().allow(null),
  rateLimitMax: Joi.number().integer().min(1).allow(null),
  rateLimitWindowMs: Joi.number().integer().min(1000).allow(null),
});
const updateSchema = Joi.object({
  name: Joi.string().min(1).max(255),
  priority: Joi.number().integer().min(1).max(100),
  concurrencyLimit: Joi.number().integer().min(1).max(1000),
  retryPolicyId: Joi.string().uuid().allow(null),
  rateLimitMax: Joi.number().integer().min(1).allow(null),
  rateLimitWindowMs: Joi.number().integer().min(1000).allow(null),
});
router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const queue = await queueService.create({
      projectId: req.params.projectId,
      ...req.body,
    });
    res.status(201).json(queue);
  } catch (error) {
    next(error);
  }
});
router.get('/', async (req, res, next) => {
  try {
    const result = await queueService.list({
      projectId: req.params.projectId,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.get('/retry-policies', async (req, res, next) => {
  try {
    const policies = await queueService.getRetryPolicies();
    res.json(policies);
  } catch (error) {
    next(error);
  }
});
router.get('/:id', async (req, res, next) => {
  try {
    const queue = await queueService.getById(req.params.id);
    res.json(queue);
  } catch (error) {
    next(error);
  }
});
router.put('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const queue = await queueService.update(req.params.id, req.body);
    res.json(queue);
  } catch (error) {
    next(error);
  }
});
router.post('/:id/pause', async (req, res, next) => {
  try {
    const queue = await queueService.pause(req.params.id);
    res.json(queue);
  } catch (error) {
    next(error);
  }
});
router.post('/:id/resume', async (req, res, next) => {
  try {
    const queue = await queueService.resume(req.params.id);
    res.json(queue);
  } catch (error) {
    next(error);
  }
});
router.delete('/:id', async (req, res, next) => {
  try {
    await queueService.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
module.exports = router;