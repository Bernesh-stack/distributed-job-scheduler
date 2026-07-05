const express = require('express');
const workerService = require('../services/workerService');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const result = await workerService.list({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      status: req.query.status || null,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await workerService.getStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});
router.get('/:id', async (req, res, next) => {
  try {
    const worker = await workerService.getById(req.params.id);
    res.json(worker);
  } catch (error) {
    next(error);
  }
});
router.get('/:id/heartbeats', async (req, res, next) => {
  try {
    const heartbeats = await workerService.getHeartbeats(req.params.id, {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    res.json(heartbeats);
  } catch (error) {
    next(error);
  }
});
module.exports = router;