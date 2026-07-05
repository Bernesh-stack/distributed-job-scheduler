const morgan = require('morgan');
const requestLogger = morgan((tokens, req, res) => {
  return JSON.stringify({
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: parseInt(tokens.status(req, res) || '0', 10),
    responseTime: `${tokens['response-time'](req, res)}ms`,
    contentLength: tokens.res(req, res, 'content-length'),
    timestamp: new Date().toISOString(),
    userId: req.user?.id || null,
  });
});
module.exports = { requestLogger };