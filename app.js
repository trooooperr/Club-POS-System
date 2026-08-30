const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const fs         = require('fs');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { isRedisHealthy } = require('./src/lib/redis');
const { requireAuth, allowCronSecret } = require('./src/middleware/auth');

const app = express();

try {
  const compression = require('compression');
  app.use(compression());
} catch (e) {
  // Compression enabled on production build via package.json
}

app.disable('x-powered-by');
app.set('trust proxy', 1); // trust first proxy (Render, Railway, etc.)

// ── Security headers ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https:', 'blob:'], // allow Unsplash, placeholders
      connectSrc:  ["'self'", 'wss:', 'ws:', 'https://cdn.jsdelivr.net', 'http://localhost:*', 'http://127.0.0.1:*'],               // allow Socket.IO WebSocket, CDN sourcemaps, and local hardware agents
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'local-network-access=(self), loopback-network=(self), local-network=(self)');
  next();
});

// ── CORS — allowlist via env ─────────────────────────────────────
// Set ALLOWED_ORIGINS in .env as a comma-separated list of allowed origins.
// If not set, defaults to localhost dev ports.
const rawOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5176,http://localhost:3001';
const allowedOrigins = rawOrigins.split(',').map(o => o.trim()).filter(Boolean);

app.use(cors((req, callback) => {
  const origin = req.header('Origin');
  let isAllowed = false;

  if (!origin) {
    isAllowed = true;
  } else if (allowedOrigins.includes(origin)) {
    isAllowed = true;
  } else {
    // Dynamically check if same-origin (requested origin matches current host header)
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === req.headers.host) {
        isAllowed = true;
      }
    } catch (e) {
      // Invalid URL in origin header
    }
  }

  if (isAllowed || process.env.NODE_ENV !== 'production') {
    callback(null, { origin: true, credentials: true });
  } else {
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  }
}));

// ── Body parsing ─────────────────────────────────────────────────
app.use(bodyParser.json({ limit: '2mb' }));

// ── General API rate limiter ─────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute window
  max: 300,                   // 300 requests per IP per minute on all API routes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
  skip: (req) => req.path.startsWith('/api/health') || req.path === '/ready',
});

// ── Auth rate limiter (tighter) ──────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 30,                     // 30 login attempts per IP per 15 min
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

// ── Public routes (no auth required) ────────────────────────────
app.use('/api/auth', authLimiter, require('./src/routes/auth'));

// ── Health checks (no auth required) ────────────────────────────
let cachedHealth = null;
let lastHealthCheck = 0;
const HEALTH_CACHE_MS = 15000; // Cache health checks for 15s to eliminate outbound ping storms

app.get('/api/health', async (req, res) => {
  const now = Date.now();
  if (cachedHealth && (now - lastHealthCheck < HEALTH_CACHE_MS)) {
    return res.status(cachedHealth.mongo ? 200 : 503).json({
      ...cachedHealth,
      uptime: process.uptime(),
    });
  }

  const mongoose = require('mongoose');
  let mongoOk = false;
  try {
    await mongoose.connection.db.command({ ping: 1 });
    mongoOk = true;
  } catch {}

  const redisOk = await isRedisHealthy();

  cachedHealth = {
    status: mongoOk ? 'ok' : 'degraded',
    mongo:  mongoOk,
    redis:  redisOk,
    env:    process.env.NODE_ENV || 'development',
    version: '3.0.2',
  };
  lastHealthCheck = now;

  res.status(mongoOk ? 200 : 503).json({
    ...cachedHealth,
    uptime: process.uptime(),
  });
});

app.get('/ready', (req, res) => {
  res.json({ ready: true });
});

// ── QZ Tray Integration Routes ──────────────────────────────────
// Public endpoint for certificate retrieval
app.get('/api/qz/certificate', async (req, res) => {
  try {
    const certPath = path.join(__dirname, 'keys/qz-certificate.crt');
    if (!fs.existsSync(certPath)) {
      return res.status(404).json({ message: 'QZ Certificate not found' });
    }
    const certificate = fs.readFileSync(certPath, 'utf8');
    res.type('text/plain').send(certificate);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Protected endpoint to sign the print requests
app.post('/api/qz/sign', requireAuth, async (req, res) => {
  try {
    const crypto = require('crypto');
    const { toSign, request } = req.body;
    const dataToSign = toSign || request;
    if (!dataToSign) {
      return res.status(400).json({ message: 'Nothing to sign' });
    }

    const keyPath = path.join(__dirname, 'keys/qz-private.key');
    if (!fs.existsSync(keyPath)) {
      return res.status(404).json({ message: 'QZ Private Key not found' });
    }

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const sign = crypto.createSign('RSA-SHA512');
    sign.update(dataToSign);
    const signature = sign.sign(privateKey, 'base64');
    
    res.send(signature);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── Protected API routes (auth required) ────────────────────────
const { router: reportsRouter } = require('./src/routes/reports');

app.use('/api/menu',      requireAuth, require('./src/routes/menu'));
app.use('/api/orders',    requireAuth, require('./src/routes/orders'));
app.use('/api/kots',      requireAuth, require('./src/routes/kots'));
app.use('/api/workers',   requireAuth, require('./src/routes/workers'));
app.use('/api/events',    requireAuth, require('./src/routes/events'));
app.use('/api/reports',   allowCronSecret, reportsRouter);
app.use('/api/settings',  requireAuth, require('./src/routes/settings'));
app.use('/api/inventory', requireAuth, require('./src/routes/inventory'));
app.use('/api/expenses',  requireAuth, require('./src/routes/expenses'));
app.use('/api/admin',     requireAuth, require('./src/routes/admin'));

// ── Static files (frontend dist) ────────────────────────────────
const frontendDist = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(frontendDist, {
  maxAge: '1y',
  immutable: true,
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

app.get('*', (req, res) => {
  const file = path.join(frontendDist, 'index.html');
  if (fs.existsSync(file)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(file);
  }
  res.json({ message: 'API running only' });
});

// ── Global error handler (must be LAST middleware) ───────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // CORS errors
  if (err.message && err.message.includes('not allowed by CORS')) {
    return res.status(403).json({ error: err.message });
  }

  const status  = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');

  if (status >= 500) {
    console.error('[ERROR]', req.method, req.path, err.message, err.stack);
  }

  res.status(status).json({ error: message });
});

module.exports = app;