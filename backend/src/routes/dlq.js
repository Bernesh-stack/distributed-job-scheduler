const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const router = express.Router();
router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const countResult = await query(
      `SELECT COUNT(*) FROM dead_letter_queue WHERE reprocessed = $1`,
      [req.query.reprocessed === 'true']
    );
    const result = await query(
      `SELECT dlq.*, q.name as queue_name
       FROM dead_letter_queue dlq
       LEFT JOIN queues q ON dlq.queue_id = q.id
       WHERE dlq.reprocessed = $1
       ORDER BY dlq.failed_at DESC
       LIMIT $2 OFFSET $3`,
      [req.query.reprocessed === 'true', limit, offset]
    );
    res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post('/:id/retry', async (req, res, next) => {
  try {
    const dlqEntry = await query(
      'SELECT * FROM dead_letter_queue WHERE id = $1',
      [req.params.id]
    );
    if (dlqEntry.rows.length === 0) {
      throw new AppError('DLQ entry not found', 404, 'DLQ_NOT_FOUND');
    }
    const entry = dlqEntry.rows[0];
    const newJob = await query(
      `INSERT INTO jobs (queue_id, type, payload, status, priority, max_retries, retry_count)
       VALUES ($1, $2, $3, 'queued', 0, 3, 0)
       RETURNING *`,
      [entry.queue_id, entry.job_type, entry.payload]
    );
    await query(
      `UPDATE dead_letter_queue SET reprocessed = TRUE, reprocessed_at = NOW(), reprocessed_job_id = $1
       WHERE id = $2`,
      [newJob.rows[0].id, req.params.id]
    );
    res.json({ dlqEntry: entry, newJob: newJob.rows[0] });
  } catch (error) {
    next(error);
  }
});
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM dead_letter_queue WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      throw new AppError('DLQ entry not found', 404, 'DLQ_NOT_FOUND');
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
module.exports = router;