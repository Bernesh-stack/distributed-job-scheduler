const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query, withTransaction } = require('../db');
const { AppError } = require('../middleware/errorHandler');
class AuthService {
  async register({ email, password, name }) {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await withTransaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, name, role)
         VALUES ($1, $2, $3, 'admin')
         RETURNING id, email, name, role, created_at`,
        [email, passwordHash, name]
      );
      const user = userResult.rows[0];
      await client.query(
        `INSERT INTO organizations (name, owner_id)
         VALUES ($1, $2)`,
        [`${name}'s Organization`, user.id]
      );
      return user;
    });
    const token = this.generateToken(result);
    return { user: result, token };
  }
  async login({ email, password }) {
    const result = await query(
      'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }
    const { password_hash, ...userData } = user;
    const token = this.generateToken(userData);
    return { user: userData, token };
  }
  async getProfile(userId) {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              o.id as org_id, o.name as org_name
       FROM users u
       LEFT JOIN organizations o ON o.owner_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    return result.rows[0];
  }
  generateToken(user) {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
  }
}
module.exports = new AuthService();