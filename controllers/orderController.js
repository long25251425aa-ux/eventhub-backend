const db = require('../config/db');

const gen = p => p+'-'+Math.random().toString(36).slice(2,6).toUpperCase()+'-'+Date.now().toString(36).toUpperCase().slice(-4);

// Đảm bảo bảng orders có đúng cột
const ensureOrdersTable = async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      event_id INT NOT NULL,
      order_code VARCHAR(30) UNIQUE NOT NULL,
      status ENUM('pending','paid','cancelled','refunded') DEFAULT 'pending',
      payment_status ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
      subtotal DECIMAL(14,0) DEFAULT 0,
      discount DECIMAL(14,0) DEFAULT 0,
      total DECIMAL(14,0) DEFAULT 0,
      coupon_code VARCHAR(50) NULL,
      notes TEXT NULL,
      paid_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4`);

    await db.query(`CREATE TABLE IF NOT EXISTS tickets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      ticket_type_id INT NOT NULL,
      user_id INT NOT NULL,
      event_id INT NOT NULL,
      ticket_code VARCHAR(30) UNIQUE NOT NULL,
      status ENUM('active','used','cancelled','expired') DEFAULT 'active',
      checked_in BOOLEAN DEFAULT FALSE,
      checked_in_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4`);
  } catch(e) { /* bỏ qua nếu đã tồn tại */ }
};

// POST /api/orders
exports.create = async (req, res) => {
  await ensureOrdersTable();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // Hỗ trợ cả 2 format: format mới {items} và format cũ {event_id, quantity}
    let { event_id, items, quantity, coupon_code, notes } = req.body;

    // Format cũ: chuyển sang format mới
    if (!items && event_id && quantity) {
      // Lấy ticket_type mặc định
      const [tts] = await conn.query('SELECT * FROM ticket_types WHERE event_id=? AND is_active=1 ORDER BY price ASC LIMIT 1', [event_id]);
      if (tts.length) items = [{ ticket_type_id: tts[0].id, quantity: parseInt(quantity)||1 }];
      else {
        // Nếu không có ticket_type, đặt vé trực tiếp từ events
        const [[ev]] = await conn.query('SELECT * FROM events WHERE id=?', [event_id]);
        if (!ev) throw new Error('Sự kiện không tồn tại');
        const total = (ev.price||0) * (parseInt(quantity)||1);
        const orderCode = gen('EVH');
        const payStatus = total===0?'paid':'pending';
        const [r] = await conn.query(
          'INSERT INTO orders(user_id,event_id,order_code,status,payment_status,subtotal,total,notes,paid_at) VALUES(?,?,?,?,?,?,?,?,?)',
          [req.user.id, event_id, orderCode, payStatus, payStatus, total, total, notes||null, total===0?new Date():null]
        );
        const code = gen('TKT');
        await conn.query('INSERT INTO tickets(order_id,ticket_type_id,user_id,event_id,ticket_code) VALUES(?,?,?,?,?)',
          [r.insertId, 0, req.user.id, event_id, code]);
        await conn.query('UPDATE events SET sold=sold+? WHERE id=?', [parseInt(quantity)||1, event_id]);
        await conn.commit();
        return res.status(201).json({ success:true, data:{ orderId:r.insertId, orderCode, total, payStatus, tickets:[code], subtotal:total, discount:0 }});
      }
    }

    if (!event_id || !items?.length) return res.status(400).json({ success:false, message:'Dữ liệu không hợp lệ' });

    const [[ev]] = await conn.query("SELECT * FROM events WHERE id=? FOR UPDATE", [event_id]);
    if (!ev) return res.status(404).json({ success:false, message:'Sự kiện không tồn tại' });

    let subtotal = 0; const valid = [];
    for (const item of items) {
      const ttId = parseInt(item.ticket_type_id) || 0;
      if (!ttId) throw new Error('ID loại vé không hợp lệ');
      const [[tt]] = await conn.query('SELECT * FROM ticket_types WHERE id=? AND event_id=? AND is_active=1 FOR UPDATE',
        [ttId, event_id]);
      if (!tt) throw new Error('Loại vé không hợp lệ');
      const rem = tt.quantity - tt.sold;
      if (rem < item.quantity) throw new Error(`Vé "${tt.name}" không đủ. Còn ${rem} vé.`);
      if (item.quantity > tt.max_per_order) throw new Error(`Tối đa ${tt.max_per_order} vé mỗi đơn`);
      subtotal += Number(tt.price||0) * item.quantity;
      valid.push({ ...tt, id: ttId, qty: parseInt(item.quantity)||1 });
    }

    let discount = 0;
    if (coupon_code) {
      const [[cp]] = await conn.query(
        "SELECT * FROM coupons WHERE code=? AND is_active=1 AND (expires_at IS NULL OR expires_at>NOW()) AND (usage_limit IS NULL OR used_count<usage_limit)",
        [coupon_code]
      ).catch(()=>[[null]]);
      if (cp && subtotal >= cp.min_order) {
        discount = cp.type==='percent' ? Math.round(subtotal*cp.value/100) : Number(cp.value);
        if (cp.max_discount) discount = Math.min(discount, cp.max_discount);
        await conn.query('UPDATE coupons SET used_count=used_count+1 WHERE id=?', [cp.id]).catch(()=>{});
      }
    }

    const total = Math.max(0, subtotal - discount);
    const orderCode = gen('EVH');
    const payStatus = total===0 ? 'paid' : 'pending';

    const [or] = await conn.query(
      'INSERT INTO orders(user_id,event_id,order_code,status,payment_status,subtotal,discount,total,coupon_code,notes,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, event_id, orderCode, payStatus, payStatus, subtotal, discount, total, coupon_code||null, notes||null, total===0?new Date():null]
    );
    const orderId = or.insertId; const tickets = [];

    for (const item of valid) {
      for (let i = 0; i < item.qty; i++) {
        const code = gen('TKT');
        await conn.query('INSERT INTO tickets(order_id,ticket_type_id,user_id,event_id,ticket_code,status) VALUES(?,?,?,?,?,?)',
          [orderId, item.id, req.user.id, event_id, code, 'active']);
        tickets.push(code);
        await conn.query('UPDATE ticket_types SET sold=sold+1 WHERE id=?', [item.id]);
      }
      await conn.query('UPDATE events SET sold=sold+? WHERE id=?', [item.qty, event_id]);
    }

    await conn.commit();

    // Thông báo
    await db.query('INSERT INTO notifications(user_id,title,message,type,action_url) VALUES(?,?,?,?,?)',
      [req.user.id, 'Đặt vé thành công! 🎫', `Đơn ${orderCode} đã tạo.${total>0?' Vui lòng thanh toán.':' Vé đã sẵn sàng.'}`, 'ticket', '/my-tickets']
    ).catch(()=>{});

    res.status(201).json({ success:true, data:{ orderId, orderCode, total, payStatus, tickets, subtotal, discount }});
  } catch(e) {
    await conn.rollback();
    res.status(500).json({ success:false, message:e.message });
  } finally { conn.release(); }
};

// GET /api/orders/my/tickets
exports.getMyTickets = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT t.*, 
        e.name as event_name,
        COALESCE(e.start_date, CONCAT(e.date,' ',COALESCE(e.time,'00:00:00'))) as event_date,
        COALESCE(e.thumbnail, e.image_url) as imageUrl,
        COALESCE(e.venue_name, e.location) as location,
        COALESCE(e.is_online, 0) as is_online,
        COALESCE(tt.name,'Ve thuong') as ticket_type_name,
        COALESCE(tt.type,'paid') as ticket_type,
        COALESCE(tt.price, e.price, 0) as price,
        COALESCE(o.total, o.total_price, 0) as total,
        o.order_code, o.status as order_status, o.payment_status,
        o.created_at as order_date, o.id as order_id
      FROM tickets t
      JOIN events e ON t.event_id=e.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id=tt.id
      JOIN orders o ON t.order_id=o.id
      WHERE t.user_id=? AND o.status='paid' ORDER BY t.created_at DESC`, [req.user.id]);
    res.json({ success:true, data:rows });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/orders/my/orders
exports.getMyOrders = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT o.*,
        e.name as event_title,
        COALESCE(e.start_date, e.date) as start_date,
        COALESCE(e.thumbnail, e.image_url) as thumbnail,
        COALESCE(e.venue_name, e.location) as venue_name,
        (SELECT COUNT(*) FROM tickets WHERE order_id=o.id) as ticket_count
      FROM orders o JOIN events e ON o.event_id=e.id
      WHERE o.user_id=? ORDER BY o.created_at DESC`, [req.user.id]);
    res.json({ success:true, data:rows });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/orders (admin)
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT o.*, u.name as user_name, u.email as user_email,
        e.name as event_title, COALESCE(e.thumbnail,e.image_url) as thumbnail,
        (SELECT COUNT(*) FROM tickets WHERE order_id=o.id) as ticket_count
      FROM orders o JOIN users u ON o.user_id=u.id JOIN events e ON o.event_id=e.id
      ORDER BY o.created_at DESC LIMIT 300`);
    res.json({ success:true, data:rows });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// PATCH /api/orders/:id/confirm-payment
exports.confirmPayment = async (req, res) => {
  try {
    const [[o]] = await db.query('SELECT * FROM orders WHERE id=?', [req.params.id]);
    if (!o) return res.status(404).json({ success:false, message:'Không tìm thấy đơn hàng' });
    await db.query("UPDATE orders SET payment_status='paid',status='paid',paid_at=NOW() WHERE id=?", [req.params.id]);
    await db.query("UPDATE tickets SET status='active' WHERE order_id=?", [req.params.id]);
    // Thông báo cho user - vé đã sẵn sàng
    await db.query('INSERT INTO notifications(user_id,title,message,type,action_url) VALUES(?,?,?,?,?)',
      [o.user_id,
       'Thanh toán xác nhận ✅ - Vé của bạn đã sẵn sàng!',
       `Đơn hàng ${o.order_code} đã được xác nhận. Vào "Vé của tôi" để xem và xuất vé PDF.`,
       'success', '/my-tickets']).catch(()=>{});
    res.json({ success:true, message:'Xác nhận thanh toán thành công! Vé đã gửi cho người dùng.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// PATCH /api/orders/checkin/:code
exports.checkin = async (req, res) => {
  try {
    const [[t]] = await db.query('SELECT t.*,e.name as event_name FROM tickets t JOIN events e ON t.event_id=e.id WHERE t.ticket_code=?',
      [req.params.code]);
    if (!t) return res.status(404).json({ success:false, message:'Mã vé không hợp lệ' });
    if (t.checked_in) return res.status(400).json({ success:false, message:'Vé đã check-in rồi', checkedInAt:t.checked_in_at });
    if (t.status !== 'active') return res.status(400).json({ success:false, message:`Vé không hợp lệ (${t.status})` });
    await db.query("UPDATE tickets SET checked_in=1,checked_in_at=NOW(),status='used' WHERE id=?", [t.id]);
    res.json({ success:true, message:'Check-in thành công! ✅', data:{ ticketCode:t.ticket_code, event:t.event_name }});
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// DELETE /api/orders/:id (cancel)
exports.cancel = async (req, res) => {
  try {
    await db.query("UPDATE orders SET status='cancelled' WHERE id=?", [req.params.id]);
    await db.query("UPDATE tickets SET status='cancelled' WHERE order_id=?", [req.params.id]);
    res.json({ success:true, message:'Đã hủy đơn hàng' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};
