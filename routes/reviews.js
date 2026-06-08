const r = require('express').Router();
const db = require('../config/db');
const { protect, adminOnly } = require('../middleware/auth');

r.get('/latest', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const [rows] = await db.query(`
      SELECT rv.id, rv.rating, rv.comment, rv.created_at,
        u.name as user_name, u.avatar as user_avatar, u.role as user_role,
        e.name as event_title, e.id as event_id, e.slug as event_slug
      FROM reviews rv
      JOIN users u ON rv.user_id = u.id
      JOIN events e ON rv.event_id = e.id
      WHERE rv.is_visible = 1 AND rv.comment IS NOT NULL AND rv.comment != ''
      ORDER BY rv.created_at DESC
      LIMIT ?
    `, [limit]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

r.get('/', protect, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT rv.*, u.name as user_name, u.email as user_email, e.name as event_title
      FROM reviews rv
      JOIN users u ON rv.user_id = u.id
      JOIN events e ON rv.event_id = e.id
      ORDER BY rv.created_at DESC LIMIT 200
    `);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

r.patch('/:id/toggle', protect, adminOnly, async (req, res) => {
  try {
    const [[rv]] = await db.query('SELECT is_visible FROM reviews WHERE id=?', [req.params.id]);
    if (!rv) return res.status(404).json({ success: false, message: 'Not found' });
    await db.query('UPDATE reviews SET is_visible=? WHERE id=?', [!rv.is_visible, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

r.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM reviews WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = r;
