const r = require('express').Router();
const db = require('../config/db');
const { protect, adminOnly } = require('../middleware/auth');

r.post('/', protect, async (req, res) => {
  try {
    const { code, type, value, min_order, max_discount, usage_limit, event_id, expires_at } = req.body;
    if (!code?.trim()) return res.status(400).json({ success: false, message: 'Vui lòng nhập mã code' });
    const [ex] = await db.query('SELECT id FROM coupons WHERE code=?', [code.trim().toUpperCase()]);
    if (ex.length) return res.status(400).json({ success: false, message: 'Mã này đã tồn tại' });
    const [r2] = await db.query(
      'INSERT INTO coupons(code,type,value,min_order,max_discount,usage_limit,event_id,expires_at,is_active) VALUES(?,?,?,?,?,?,?,?,1)',
      [code.trim().toUpperCase(), type||'percent', value||10, min_order||0, max_discount||null, usage_limit||100, event_id||null, expires_at||null]
    );
    res.status(201).json({ success: true, message: 'Tạo mã giảm giá thành công', id: r2.insertId });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

r.get('/', protect, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

r.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM coupons WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa mã giảm giá' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = r;
