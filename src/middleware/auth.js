const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'humtum-pos-secret-key-change-in-production';

// ── Access token (short-lived: 15 minutes) ───────────────────────
/**
 * Generate a short-lived JWT access token (15 min) with optional sessionId.
 */
function generateToken(user, sessionId = null) {
  const payload = {
    id: user._id,
    username: user.username,
    role: user.role
  };
  if (sessionId) {
    payload.sessionId = sessionId;
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

// ── Refresh token (long-lived opaque token: 30 days) ─────────────
const REFRESH_TOKEN_BYTES = 48;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

/**
 * Generate a cryptographically random refresh token (opaque, not JWT).
 * Returns { raw, hash, expiresAt } — store hash+expiresAt in DB, send raw to client.
 */
function generateRefreshToken() {
  const raw       = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const hash      = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return { raw, hash, expiresAt };
}

/**
 * Hash a raw refresh token for comparison against stored hash.
 */
function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── requireAuth middleware ────────────────────────────────────────
/**
 * Middleware: require valid JWT access token
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired, please login again', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
}

/**
 * Middleware: require specific role(s)
 * Usage: requireRole('admin') or requireRole(['admin', 'manager'])
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Middleware: Allow either valid JWT OR a valid Cron Secret
 */
function allowCronSecret(req, res, next) {
  const cronSecret = req.headers['x-cron-secret'];
  const envSecret  = process.env.CRON_SECRET || 'humtum_cron_secret_2026';

  if (cronSecret && cronSecret === envSecret) {
    req.user = { role: 'admin', username: 'cron_job' };
    return next();
  }

  return requireAuth(req, res, next);
}

module.exports = {
  generateToken,
  generateRefreshToken,
  hashRefreshToken,
  requireAuth,
  requireRole,
  allowCronSecret,
  JWT_SECRET,
  REFRESH_TOKEN_EXPIRY_DAYS
};
