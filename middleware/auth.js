const jwt = require('jsonwebtoken');
const db = require('../config/db');

const protect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    const [rows] = await db.query('SELECT id,name,email,role FROM users WHERE id=?', [decoded.id]);
    if (!rows.length) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'Admin only' });
};

module.exports = { protect, adminOnly };
