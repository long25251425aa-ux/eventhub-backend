const r = require('express').Router();
const db = require('../config/db');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/users/notifications
r.get('/notifications', protect, async (req, res) => {
  try {
    const uid = (req.user.role === 'support') ? 1 : req.user.id;
    const limit = (req.user.role === 'support') ? 200 : 50;
    const [rows] = await db.query(
      'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ' + limit,
      [uid]
    );
    const [[{ unread }]] = await db.query(
      'SELECT COUNT(*) as unread FROM notifications WHERE user_id=? AND is_read=0',
      [uid]
    );
    res.json({ success: true, data: rows, unread });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/users/notifications/read-all
r.patch('/notifications/read-all', protect, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id]);
    res.json({ success: true, message: 'ÄÃ£ Ä‘á»c táº¥t cáº£ thÃ´ng bÃ¡o' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/users/notifications/:id/read
r.patch('/notifications/:id/read', protect, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=1 WHERE user_id=? AND id=?', [req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/users/favorites
r.get('/favorites', protect, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*, f.created_at as saved_at
       FROM favorites f JOIN events e ON f.event_id=e.id
       WHERE f.user_id=? ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/users/coupons/validate
r.post('/coupons/validate', protect, async (req, res) => {
  try {
    const { code, event_id, amount } = req.body;
    if (!code?.trim()) return res.status(400).json({ success: false, message: 'Vui lÃ²ng nháº­p mÃ£ giáº£m giÃ¡' });
    const [[cp]] = await db.query(
      "SELECT * FROM coupons WHERE code=? AND is_active=1 AND (expires_at IS NULL OR expires_at>NOW()) AND (usage_limit IS NULL OR used_count<usage_limit) AND (event_id IS NULL OR event_id=? OR event_id=0)",
      [code.trim().toUpperCase(), event_id||0]
    );
    if (!cp) return res.status(400).json({ success: false, message: 'MÃ£ khÃ´ng há»£p lá»‡, háº¿t háº¡n hoáº·c Ä‘Ã£ dÃ¹ng háº¿t' });
    const orderAmt = Number(amount) || 0;
    if (orderAmt < Number(cp.min_order||0)) return res.status(400).json({ success: false, message: `ÄÆ¡n tá»‘i thiá»ƒu ${Number(cp.min_order).toLocaleString('vi-VN')}Ä‘ Ä‘á»ƒ dÃ¹ng mÃ£ nÃ y` });
    let discount = cp.type === 'percent'
      ? Math.round(orderAmt * Number(cp.value) / 100)
      : Number(cp.value);
    if (cp.max_discount) discount = Math.min(discount, Number(cp.max_discount));
    discount = Math.min(discount, orderAmt); // khÃ´ng giáº£m quÃ¡ tá»•ng Ä‘Æ¡n
    const pct = orderAmt > 0 ? Math.round(discount/orderAmt*100) : 0;
    res.json({
      success: true,
      discount,
      coupon: { code: cp.code, type: cp.type, value: cp.value },
      message: `âœ… Ãp dá»¥ng thÃ nh cÃ´ng! Giáº£m ${discount.toLocaleString('vi-VN')}Ä‘ (${pct}%)`
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/users â€” admin only
r.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { search, role, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT id,name,email,phone,avatar,role,is_verified,is_locked,created_at FROM users WHERE 1=1';
    const p = [];
    if (search) { sql += ' AND (name LIKE ? OR email LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
    if (role) { sql += ' AND role=?'; p.push(role); }
    sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${(parseInt(page) - 1) * parseInt(limit)}`;
    const [rows] = await db.query(sql, p);
    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM users');
    res.json({ success: true, data: rows, total });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/users/:id/lock
r.patch('/:id/lock', protect, adminOnly, async (req, res) => {
  try {
    const [[u]] = await db.query('SELECT is_locked, name FROM users WHERE id=?', [req.params.id]);
    if (!u) return res.status(404).json({ success: false, message: 'KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng' });
    await db.query('UPDATE users SET is_locked=? WHERE id=?', [!u.is_locked, req.params.id]);
    res.json({ success: true, message: u.is_locked ? `ÄÃ£ má»Ÿ khÃ³a ${u.name}` : `ÄÃ£ khÃ³a tÃ i khoáº£n ${u.name}` });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/users/:id/role
r.patch('/:id/role', protect, adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'organizer', 'user', 'support'].includes(role))
      return res.status(400).json({ success: false, message: 'Vai trÃ² khÃ´ng há»£p lá»‡' });
    await db.query('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
    res.json({ success: true, message: 'Cáº­p nháº­t vai trÃ² thÃ nh cÃ´ng' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});


// GET /api/users/support/messages - Láº¥y táº¥t cáº£ tin nháº¯n live chat
r.get('/support/messages', protect, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT n.*, u.name as sender_name, u.email as sender_email
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.title LIKE 'ðŸ’¬ Live Chat%'
      ORDER BY n.created_at DESC LIMIT 200
    `);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/users/support/reply - Gá»­i pháº£n há»“i cho user
r.post('/support/reply', protect, async (req, res) => {
  try {
    const { to_email, message, support_name } = req.body;
    const [[u]] = await db.query('SELECT id FROM users WHERE email=?', [to_email]);
    if (u) {
      await db.query(
        'INSERT INTO notifications(user_id, title, message, type) VALUES(?,?,?,?)',
        [u.id,
         'Phan hoi tu Support (' + (support_name || 'Admin') + ')',
         message,
         'info']
      );
    }
    res.json({ success: true, message: 'Da gui phan hoi' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/users/contact-admin - Gá»­i tin nháº¯n live chat Ä‘áº¿n admin
r.post('/contact-admin', protect, async (req, res) => {
  try {
    const { message } = req.body;
    const sender = req.user;
    // LÆ°u vÃ o notifications vá»›i title chuáº©n Ä‘á»ƒ support Ä‘á»c Ä‘Æ°á»£c
    await db.query(
      'INSERT INTO notifications(user_id, title, message, type) VALUES(?,?,?,?)',
      [1,
       'ðŸ’¬ Live Chat tá»« ' + sender.name + ' <' + sender.email + '>',
       message,
       'info']
    );
    res.json({ success: true, message: 'ÄÃ£ gá»­i Ä‘áº¿n admin' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});


// GET /api/users/chat/history - Láº¥y lá»‹ch sá»­ chat cá»§a user
r.get('/chat/history', protect, async (req, res) => {
  try {
    // Láº¥y tin nháº¯n cá»§a user + reply tá»« support gá»­i cho user nÃ y
    const [rows] = await db.query(
      'SELECT * FROM chat_messages WHERE (sender_id=? AND is_support=0) OR (is_support=1 AND (sender_email=? OR sender_email=?)) ORDER BY created_at ASC LIMIT 100',
      [req.user.id, req.user.email, 'uid_' + req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/users/chat/all - Support xem táº¥t cáº£ chat
r.get('/chat/all', protect, async (req, res) => {
  try {
    if (!['admin','support'].includes(req.user.role))
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const [rows] = await db.query(
      'SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 500'
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/users/chat/send - Gá»­i tin nháº¯n
r.post('/chat/send', protect, async (req, res) => {
  try {
    const { message, to_email } = req.body;
    const isSupport = ['admin','support'].includes(req.user.role) ? 1 : 0;
    const { to_user_id } = req.body;

    if (!isSupport) {
      // User gá»­i â†’ lÆ°u vá»›i email cá»§a mÃ¬nh
      await db.query(
        'INSERT INTO chat_messages(sender_id, sender_name, sender_email, message, is_support) VALUES(?,?,?,?,0)',
        [req.user.id, req.user.name, req.user.email, message]
      );
      await db.query(
        'INSERT INTO notifications(user_id, title, message, type) VALUES(?,?,?,?)',
        [1, 'Live Chat tu ' + req.user.name + ' <' + req.user.email + '>', message, 'info']
      ).catch(()=>{});
    } else {
      // Support reply â†’ tÃ¬m email tháº­t cá»§a user
      let targetUserId = to_user_id || null;
      let targetEmail = null;

      if (to_email && to_email.includes('@')) {
        const [[u]] = await db.query('SELECT id, email FROM users WHERE email=?', [to_email]);
        if (u) { targetUserId = u.id; targetEmail = u.email; }
      } else if (targetUserId) {
        const [[u]] = await db.query('SELECT id, email FROM users WHERE id=?', [targetUserId]);
        if (u) { targetEmail = u.email; }
      }

      // LÆ°u vá»›i sender_email = email cá»§a user Ä‘Æ°á»£c reply
      await db.query(
        'INSERT INTO chat_messages(sender_id, sender_name, sender_email, message, is_support) VALUES(?,?,?,?,1)',
        [req.user.id, req.user.name, targetEmail || '', message]
      );

      if (targetUserId) {
        await db.query(
          'INSERT INTO notifications(user_id, title, message, type) VALUES(?,?,?,?)',
          [targetUserId, 'Phan hoi tu Support (' + req.user.name + ')', message, 'info']
        );
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});


// GET /api/users/notifications/all - Admin xem tat ca notifications
r.get('/notifications/all', protect, async (req, res) => {
  try {
    if (!['admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Unauthorized' });
    const [rows] = await db.query('SELECT n.*, u.name as user_name, u.email as user_email FROM notifications n LEFT JOIN users u ON n.user_id=u.id ORDER BY n.created_at DESC LIMIT 100');
    res.json({ success: true, data: rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});
module.exports = r;


