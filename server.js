require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// â”€â”€ Báº£o máº­t cÆ¡ báº£n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try {
  const helmet = require('helmet');
  app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
} catch { console.log('[Security] helmet chÆ°a cÃ i, bá» qua'); }

try {
  const rateLimit = require('express-rate-limit');
  // Rate limit tá»•ng: 200 req/15 phÃºt
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { success: false, message: 'QuÃ¡ nhiá»u yÃªu cáº§u, vui lÃ²ng thá»­ láº¡i sau' }, standardHeaders: true, legacyHeaders: false }));
  // Rate limit Ä‘áº·c biá»‡t cho auth: 10 láº§n Ä‘Äƒng nháº­p/15 phÃºt
  app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'QuÃ¡ nhiá»u láº§n Ä‘Äƒng nháº­p, vui lÃ²ng thá»­ láº¡i sau 15 phÃºt' } }));
} catch { console.log('[Security] express-rate-limit chÆ°a cÃ i, bá» qua'); }

// â”€â”€ CORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(cors({
  origin: ['http://localhost:3000', 'https://eventhub-frontend-git-main-eventhub-s-projects.vercel.app', 'https://eventhub-frontend-six.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// â”€â”€ Body parser (giá»›i háº¡n 20MB cho áº£nh base64) â”€â”€â”€â”€
app.use((req, res, next) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); next(); });
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// â”€â”€ Request logger (dev) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toLocaleTimeString('vi-VN')}] ${req.method} ${req.path}`);
    next();
  });
}

// â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/events',  require('./routes/events'));
app.use('/api/orders',  require('./routes/orders'));
app.use('/api/refunds', require('./routes/refunds'));
app.use('/api/users',   require('./routes/users'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/coupons', require('./routes/coupons'));

// â”€â”€ Health check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/health', (_, res) => res.json({ ok: true, time: new Date().toISOString(), env: process.env.NODE_ENV || 'development' }));

// â”€â”€ 404 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use((req, res) => res.status(404).json({ success: false, message: `KhÃ´ng tÃ¬m tháº¥y Ä‘Æ°á»ng dáº«n: ${req.method} ${req.path}` }));

// â”€â”€ Error handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use((err, req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lá»—i há»‡ thá»‘ng' });
});

// â”€â”€ Start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\nðŸš€ EventHub API Ä‘ang cháº¡y táº¡i http://localhost:${PORT}`);
  console.log(`ðŸ“‹ Health check: http://localhost:${PORT}/api/health\n`);
});




