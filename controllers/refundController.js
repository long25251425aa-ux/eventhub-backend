const db = require('../config/db');

// POST /api/refunds — user gui yeu cau hoan ve
exports.create = async (req, res) => {
  try {
    const { order_id, reason } = req.body;
    if (!order_id || !reason?.trim())
      return res.status(400).json({ success:false, message:'Vui long nhap ly do hoan ve' });

    // Tìm order trực tiếp hoặc qua tickets
    let [[order]] = await db.query('SELECT * FROM orders WHERE id=? AND user_id=?', [order_id, req.user.id]);
    if (!order) {
      // Thử tìm qua tickets (user có ticket thuộc order này)
      const [[ticket]] = await db.query('SELECT o.* FROM orders o JOIN tickets t ON t.order_id=o.id WHERE o.id=? AND t.user_id=?', [order_id, req.user.id]);
      if (!ticket) return res.status(404).json({ success:false, message:'Khong tim thay don hang' });
      order = ticket;
    }
    if (order.status === 'cancelled') return res.status(400).json({ success:false, message:'Don hang da bi huy' });
    if (order.status === 'checked') return res.status(400).json({ success:false, message:'Ve da duoc su dung, khong the hoan' });

    const [[existing]] = await db.query(
      "SELECT id FROM refund_requests WHERE order_id=? AND status!='rejected'", [order_id]
    );
    if (existing) return res.status(400).json({ success:false, message:'Yeu cau hoan ve da duoc gui truoc do' });

    const [r] = await db.query(
      'INSERT INTO refund_requests(order_id,user_id,reason) VALUES(?,?,?)',
      [order_id, req.user.id, reason.trim()]
    );
    res.status(201).json({ success:true, message:'Gui yeu cau hoan ve thanh cong', id: r.insertId });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/refunds/my — lay danh sach yeu cau cua user
exports.getMy = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, o.ticket_code, e.name as event_name, o.total_price, COALESCE(o.total, o.total_price, 0) as total, o.quantity
       FROM refund_requests r
       JOIN orders o ON r.order_id=o.id
       JOIN events e ON o.event_id=e.id
       WHERE r.user_id=?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json({ success:true, data:rows });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/refunds — admin xem tat ca
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, o.ticket_code, o.total_price, COALESCE(o.total, o.total_price, 0) as total, o.quantity,
        e.name as event_name, u.name as user_name, u.email as user_email
       FROM refund_requests r
       JOIN orders o ON r.order_id=o.id
       JOIN events e ON o.event_id=e.id
       JOIN users u ON r.user_id=u.id
       ORDER BY r.created_at DESC`
    );
    res.json({ success:true, data:rows });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// PATCH /api/refunds/:id — admin duyet/tu choi
exports.review = async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    if (!['approved','rejected'].includes(status))
      return res.status(400).json({ success:false, message:'Trang thai khong hop le' });

    const [[rr]] = await db.query('SELECT * FROM refund_requests WHERE id=?', [req.params.id]);
    if (!rr) return res.status(404).json({ success:false, message:'Khong tim thay yeu cau' });

    await db.query(
      'UPDATE refund_requests SET status=?, admin_note=?, updated_at=NOW() WHERE id=?',
      [status, admin_note||null, req.params.id]
    );

    if (status === 'approved') {
      await db.query("UPDATE orders SET status='refunded' WHERE id=?", [rr.order_id]);
      await db.query("UPDATE tickets SET status='cancelled' WHERE order_id=?", [rr.order_id]);
      const [[o]] = await db.query('SELECT * FROM orders WHERE id=?', [rr.order_id]);
      if (o) await db.query('UPDATE events SET sold=GREATEST(0,sold-1) WHERE id=?', [o.event_id]);
    }

    // Gửi thông báo cho User
    const [[rr2]] = await db.query('SELECT rr.*, o.order_code FROM refund_requests rr JOIN orders o ON rr.order_id=o.id WHERE rr.id=?', [req.params.id]);
    if (rr2) {
      const title = status === 'approved' ? 'Refund request được duyệt ✅' : 'Refund request bị từ chối ❌';
      const msg = status === 'approved'
        ? `Order ${rr2.order_code} đã được hoàn tiền Success.${admin_note ? ' Ghi chú: ' + admin_note : ''}`
        : `Refund request đơn ${rr2.order_code} không được chấp nhận.${admin_note ? ' Lý do: ' + admin_note : ''}`;
      await db.query(
        'INSERT INTO notifications(user_id, title, message, type) VALUES(?,?,?,?)',
        [rr2.user_id, title, msg, status === 'approved' ? 'success' : 'error']
      ).catch(() => {});
    }

    res.json({ success:true, message: status==='approved'?'Đã duyệt hoàn vé':'Đã từ chối' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};
