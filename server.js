require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// ── Bảo mật cơ bản ────────────────────────────────
try {
  const helmet = require('helmet');
  app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
} catch { console.log('[Security] helmet chưa cài, bỏ qua'); }

try {
  const rateLimit = require('express-rate-limit');
  // Rate limit tổng: 200 req/15 phút
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' }, standardHeaders: true, legacyHeaders: false }));
  // Rate limit đặc biệt cho auth: 10 lần đăng nhập/15 phút
  app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Quá nhiều lần đăng nhập, vui lòng thử lại sau 15 phút' } }));
} catch { console.log('[Security] express-rate-limit chưa cài, bỏ qua'); }

// ── CORS ──────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parser (giới hạn 20MB cho ảnh base64) ────
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ── Request logger (dev) ──────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toLocaleTimeString('vi-VN')}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/events',  require('./routes/events'));
app.use('/api/orders',  require('./routes/orders'));
app.use('/api/refunds', require('./routes/refunds'));
app.use('/api/users',   require('./routes/users'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/coupons', require('./routes/coupons'));

// ── Health check ──────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true, time: new Date().toISOString(), env: process.env.NODE_ENV || 'development' }));

// ── 404 ───────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: `Không tìm thấy đường dẫn: ${req.method} ${req.path}` }));

// ── Error handler ─────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi hệ thống' });
});

// ── Start ─────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 EventHub API đang chạy tại http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health\n`);
});
