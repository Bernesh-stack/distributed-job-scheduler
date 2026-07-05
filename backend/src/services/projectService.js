const { query } = require('../db');
const { AppError } = require('../middleware/errorHandler');
const config = require('../config');
class ProjectService {
  async create({ name, description, userId }) {
    const orgResult = await query(
      'SELECT id FROM organizations WHERE owner_id = $1 LIMIT 1',
      [userId]
    );
    if (orgResult.rows.length === 0) {
      throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
    }
    const result = await query(
      `INSERT INTO projects (name, description, org_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, description || null, orgResult.rows[0].id, userId]
    );
    return result.rows[0];
  }
  async list({ userId, page = 1, limit = 20 }) {
    limit = Math.min(limit, config.maxPageSize);
    const offset = (page - 1) * limit;
    const countResult = await query(
      `SELECT COUNT(*) FROM projects p
       JOIN organizations o ON p.org_id = o.id
       WHERE o.owner_id = $1`,
      [userId]
    );
    const result = await query(
      `SELECT p.*, o.name as org_name,
              (SELECT COUNT(*) FROM queues q WHERE q.project_id = p.id) as queue_count
       FROM projects p
       JOIN organizations o ON p.org_id = o.id
       WHERE o.owner_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit),
      },
    };
  }
  async getById(id, userId) {
    const result = await query(
      `SELECT p.*, o.name as org_name
       FROM projects p
       JOIN organizations o ON p.org_id = o.id
       WHERE p.id = $1 AND o.owner_id = $2`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }
    return result.rows[0];
  }
  async update(id, { name, description }, userId) {
    await this.getById(id, userId);
    const result = await query(
      `UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description)
       WHERE id = $3 RETURNING *`,
      [name, description, id]
    );
    return result.rows[0];
  }
  async delete(id, userId) {
    await this.getById(id, userId);
    await query('DELETE FROM projects WHERE id = $1', [id]);
    return { deleted: true };
  }
}
module.exports = new ProjectService();