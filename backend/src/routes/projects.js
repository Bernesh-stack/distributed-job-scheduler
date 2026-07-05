const express = require('express');
const Joi = require('joi');
const projectService = require('../services/projectService');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);
const createSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow('', null),
});
const updateSchema = Joi.object({
  name: Joi.string().min(1).max(255),
  description: Joi.string().max(1000).allow('', null),
});
const querySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const project = await projectService.create({ ...req.body, userId: req.user.id });
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});
router.get('/', validate(querySchema, 'query'), async (req, res, next) => {
  try {
    const result = await projectService.list({ userId: req.user.id, ...req.query });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.get('/:id', async (req, res, next) => {
  try {
    const project = await projectService.getById(req.params.id, req.user.id);
    res.json(project);
  } catch (error) {
    next(error);
  }
});
router.put('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const project = await projectService.update(req.params.id, req.body, req.user.id);
    res.json(project);
  } catch (error) {
    next(error);
  }
});
router.delete('/:id', async (req, res, next) => {
  try {
    await projectService.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
module.exports = router;