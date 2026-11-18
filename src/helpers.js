const crypto = require('crypto');

// Express 4 does not catch errors in async functions -> wrap every async route
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Error with an HTTP status code, e.g. httpError(404, 'Order not found')
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ---------- very simple sessions (kept in memory, reset when the server restarts) ----------
const sessions = new Map(); // token -> { type: 'customer', id } | { type: 'admin' }

function createSession(data) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, data);
  return token;
}

function readSession(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return sessions.get(token);
}

function requireCustomer(req, res, next) {
  const s = readSession(req);
  if (!s || s.type !== 'customer') return res.status(401).json({ error: 'Please log in' });
  req.user = s;
  next();
}

function requireAdmin(req, res, next) {
  const s = readSession(req);
  if (!s || s.type !== 'admin') return res.status(401).json({ error: 'Staff login required' });
  next();
}

module.exports = { ah, httpError, createSession, requireCustomer, requireAdmin };
