function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      error: err.message,
      code: err.code || 'OPERATIONAL_ERROR',
      details: err.details || null,
    });
  }
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Resource already exists',
      code: 'DUPLICATE_ENTRY',
      details: err.detail,
    });
  }
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Referenced resource not found',
      code: 'FOREIGN_KEY_VIOLATION',
      details: err.detail,
    });
  }
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    details: process.env.NODE_ENV === 'development' ? err.message : null,
  });
}
class AppError extends Error {
  constructor(message, statusCode = 400, code = 'APP_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}
module.exports = { errorHandler, AppError };