const db = require('../config/db');

const parse = (e) => {
  if (!e) return null;
  let speakers = [];
  try {
    if (Array.isArray(e.speakers)) speakers = e.speakers;
    else if (typeof e.speakers === 'string' && e.speakers.trim().startsWith('[')) speakers = JSON.parse(e.speakers);
    else speakers = [];
  } catch { speakers = []; }
  const safeJSON = (v, d) => { if(Array.isArray(v)||v&&typeof v==='object') return v; try{return JSON.parse(v||JSON.stringify(d));}catch{return d;} };
  return {
    ...e,
    title: e.title || e.name,
    speakers,
    imageUrl: e.image_url || e.thumbnail || null,
    thumbnail: e.thumbnail || e.image_url || null,
    // Map sang format mới cho EventDetail.jsx
    start_date: e.start_date || (e.date && e.time ? `${e.date}T${e.time}` : e.date) || null,
    venue_name: e.venue_name || e.location || null,
    venue_address: e.venue_address || e.location || null,
    organizer_name: e.organizer_name || 'Ban tổ chức',
    organizer_avatar: e.organizer_avatar || null,
    organizer_email: e.organizer_email || null,
    avg_rating: e.avg_rating || 0,
    review_count: e.review_count || 0,
    category_name: e.category_name || e.type || null,
    category_icon: e.category_icon || null,
    category_color: e.category_color || '#7c3aed',
    tags: safeJSON(e.tags, []),
    agenda: safeJSON(e.agenda, []),
    faq: safeJSON(e.faq, []),
  };
};

const cleanDate = d => {
  if (!d) return null;
  const s = String(d).split('T')[0];
  const p = s.split('-');
  return p.length >= 3 ? `${p[0].slice(-4)}-${p[1]}-${p[2]}` : s;
};

// GET /api/events
exports.getAll = async (req, res) => {
  try {
    const { type, search, status, sort, category, featured } = req.query;
    let sql = `SELECT e.*,
      u.name as organizer_name, u.avatar as organizer_avatar,
      c.name as category_name, c.icon as category_icon, c.color as category_color,
      (SELECT ROUND(AVG(rating),1) FROM reviews WHERE event_id=e.id) as avg_rating,
      (SELECT COUNT(*) FROM reviews WHERE event_id=e.id) as review_count,
      (SELECT MIN(price) FROM ticket_types WHERE event_id=e.id AND is_active=1) as min_price
      FROM events e
      LEFT JOIN users u ON e.organizer_id=u.id
      LEFT JOIN categories c ON e.category_id=c.id
      WHERE 1=1`;
    const p = [];
    if (type && type !== 'all') { sql += ' AND e.type=?'; p.push(type); }
    if (category) { sql += ' AND c.slug=?'; p.push(category); }
    if (search) { sql += ' AND (e.name LIKE ? OR e.location LIKE ? OR e.venue_name LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status && status !== 'all') { sql += ' AND e.status=?'; p.push(status); }
    if (featured === '1') sql += ' AND e.is_featured=1';
    const sortMap = { hot: 'e.view_count DESC', soon: 'COALESCE(e.start_date, e.date) ASC', popular: 'e.sold DESC', newest: 'e.created_at DESC' };
    sql += ` ORDER BY ${sortMap[sort] || 'e.created_at DESC'}`;
    const [rows] = await db.query(sql, p);
    res.json({ success: true, data: rows.map(parse), total: rows.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /api/events/stats
exports.getStats = async (req, res) => {
  try {
    const [[{totalEvents}]] = await db.query("SELECT COUNT(*) as totalEvents FROM events WHERE status='active' OR status='published'");
    const [[{totalTickets}]] = await db.query("SELECT COUNT(*) as totalTickets FROM tickets WHERE status!='cancelled'").catch(()=>[[{totalTickets:0}]]);
    const [[{totalRevenue}]] = await db.query("SELECT COALESCE(SUM(total),0) as totalRevenue FROM orders WHERE status='paid'").catch(()=>[[{totalRevenue:0}]]);
    const [[{totalUsers}]] = await db.query("SELECT COUNT(*) as totalUsers FROM users WHERE role='user'");
    const [[{checkedIn}]] = await db.query("SELECT COUNT(*) as checkedIn FROM tickets WHERE checked_in=1").catch(()=>[[{checkedIn:0}]]);
    const [[{totalTix}]] = await db.query("SELECT COUNT(*) as totalTix FROM tickets WHERE status='active'").catch(()=>[[{totalTix:0}]]);
    const checkinRate = totalTix > 0 ? Math.round(checkedIn / totalTix * 100) : 0;
    const [topEvents] = await db.query(`SELECT e.id,e.name as title,e.image_url as thumbnail,e.sold,e.capacity,COALESCE(e.start_date,e.date) as start_date,COALESCE(SUM(o.total),0) as revenue FROM events e LEFT JOIN orders o ON e.id=o.event_id AND o.status='paid' GROUP BY e.id ORDER BY revenue DESC LIMIT 5`).catch(()=>[[]]);;
    const [recentOrders] = await db.query(`SELECT o.*,u.name as user_name,e.name as event_title FROM orders o JOIN users u ON o.user_id=u.id JOIN events e ON o.event_id=e.id ORDER BY o.created_at DESC LIMIT 8`).catch(()=>[[]]);
    const [byCategory] = await db.query(`SELECT c.name,c.color,COUNT(e.id) as count FROM categories c LEFT JOIN events e ON c.id=e.category_id GROUP BY c.id ORDER BY count DESC`).catch(()=>[[]]);
    res.json({ success: true, data: { totalEvents, totalTickets, totalRevenue, totalUsers, checkinRate, topEvents, recentOrders, byCategory } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /api/events/categories
exports.getCategories = async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT c.*,(SELECT COUNT(*) FROM events WHERE category_id=c.id) as event_count FROM categories c ORDER BY event_count DESC`);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /api/events/:id
exports.getOne = async (req, res) => {
  try {
    // Tăng view count
    await db.query('UPDATE events SET view_count=COALESCE(view_count,0)+1 WHERE id=? OR slug=?', [req.params.id, req.params.id]);
    const [rows] = await db.query(`
      SELECT e.*,
        u.name as organizer_name, u.avatar as organizer_avatar, u.email as organizer_email,
        c.name as category_name, c.icon as category_icon, c.color as category_color,
        (SELECT ROUND(AVG(rating),1) FROM reviews WHERE event_id=e.id) as avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE event_id=e.id) as review_count
      FROM events e
      LEFT JOIN users u ON e.organizer_id=u.id
      LEFT JOIN categories c ON e.category_id=c.id
      WHERE e.id=? OR e.slug=?`, [req.params.id, req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Event not found' });
    const ev = parse(rows[0]);

    // Lấy ticket_types
    const [types] = await db.query('SELECT * FROM ticket_types WHERE event_id=? AND is_active=1 ORDER BY price ASC', [ev.id]);
    // Nếu chưa có ticket_types, tạo mặc định từ price
    if (!types.length) {
      await db.query(
        'INSERT INTO ticket_types(event_id,name,type,price,quantity,sold,max_per_order) VALUES(?,?,?,?,?,?,?)',
        [ev.id, ev.price==0?'Vé miễn phí':'Vé thường', ev.price==0?'free':'paid', ev.price||0, ev.capacity||100, ev.sold||0, 5]
      );
      const [newTypes] = await db.query('SELECT * FROM ticket_types WHERE event_id=?', [ev.id]);
      ev.ticketTypes = newTypes;
    } else {
      ev.ticketTypes = types;
    }

    // Lấy speakers từ JSON cũ
    if (!ev.speakers?.length) {
      const [spk] = await db.query('SELECT * FROM speakers WHERE event_id=?', [ev.id]).catch(()=>[[]]);
      ev.speakers = spk.length ? spk : ev.speakers || [];
    }

    // Lấy reviews
    const [reviews] = await db.query(`
      SELECT r.*, u.name as user_name, u.avatar as user_avatar
      FROM reviews r JOIN users u ON r.user_id=u.id
      WHERE r.event_id=? AND r.is_visible=1
      ORDER BY r.created_at DESC LIMIT 10`, [ev.id]).catch(()=>[[]]);
    ev.reviews = reviews;

    // Kiểm tra yêu thích
    let isFavorite = false;
    if (req.user) {
      const [fav] = await db.query('SELECT 1 FROM favorites WHERE user_id=? AND event_id=?', [req.user.id, ev.id]).catch(()=>[[]]);
      isFavorite = fav.length > 0;
    }
    ev.isFavorite = isFavorite;

    res.json({ success: true, data: ev });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /api/events
exports.create = async (req, res) => {
  try {
    const { name, title, type, description, date, start_date, time, location, venue_name, venue_address,
      capacity, price, emoji, bg_color, speakers, status, imageUrl, thumbnail, banner,
      category_id, is_online, online_url, refund_policy, tags, agenda, faq, ticketTypes } = req.body;

    const eventName = name || title || '';
    const eventDate = cleanDate(start_date || date);
    const eventTime = time || (start_date ? start_date.split('T')[1]?.slice(0,5) : '09:00') || '09:00';
    const eventLocation = venue_name || location || '';
    const eventImg = thumbnail || imageUrl || null;
    let slugify; try { slugify = require('slugify'); } catch { slugify = s => s.toLowerCase().replace(/\s+/g,'-'); }
    const fn = typeof slugify==='function'?(slugify.default||slugify):slugify;
    const slug = `${fn(eventName,{lower:true})}-${Date.now()}`;

    const [r] = await db.query(
      `INSERT INTO events(name,type,description,date,time,location,capacity,price,emoji,bg_color,speakers,status,image_url,
        thumbnail,banner,venue_name,venue_address,start_date,is_online,online_url,category_id,organizer_id,
        refund_policy,tags,agenda,faq,slug,view_count,is_featured)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
      [eventName, type||'Workshop', description||'', eventDate, eventTime, eventLocation,
       capacity||100, price||0, emoji||'🎫', bg_color||'#1a1510',
       JSON.stringify(Array.isArray(speakers)?speakers:[]), status||'active', eventImg,
       eventImg, banner||null, eventLocation, venue_address||eventLocation,
       eventDate ? `${eventDate} ${eventTime}:00` : null,
       is_online?1:0, online_url||null, category_id||null, req.user?.id||1,
       refund_policy||'', JSON.stringify(tags||[]), JSON.stringify(agenda||[]), JSON.stringify(faq||[]), slug]
    );
    const eid = r.insertId;

    // Tạo ticket_types
    if (ticketTypes?.length) {
      for (const tt of ticketTypes) {
        await db.query('INSERT INTO ticket_types(event_id,name,type,price,quantity,max_per_order,description) VALUES(?,?,?,?,?,?,?)',
          [eid, tt.name||'Vé thường', tt.type||'paid', tt.price||0, tt.quantity||100, tt.max_per_order||5, tt.description||'']);
      }
    } else {
      await db.query('INSERT INTO ticket_types(event_id,name,type,price,quantity,max_per_order) VALUES(?,?,?,?,?,?)',
        [eid, price==0?'Vé miễn phí':'Vé thường', price==0?'free':'paid', price||0, capacity||100, 5]);
    }
    // Tự động cập nhật price từ ticket_types
    await db.query(
      'UPDATE events SET price=(SELECT COALESCE(MIN(price),0) FROM ticket_types WHERE event_id=? AND is_active=1) WHERE id=?',
      [eid, eid]
    );

    const [ev] = await db.query('SELECT * FROM events WHERE id=?', [eid]);
    res.status(201).json({ success: true, data: parse(ev[0]), id: eid, slug });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PUT /api/events/:id
exports.update = async (req, res) => {
  try {
    const { name, title, type, description, date, start_date, time, location, venue_name,
      capacity, price, emoji, bg_color, speakers, status, imageUrl, thumbnail,
      category_id, is_online, online_url, refund_policy, tags, agenda, faq } = req.body;

    const eventName = name || title || '';
    const eventDate = cleanDate(start_date || date);
    const eventTime = time || (start_date ? start_date.split('T')[1]?.slice(0,5) : '09:00') || '09:00';
    const eventLocation = venue_name || location || '';
    const eventImg = thumbnail || imageUrl || null;

    await db.query(
      `UPDATE events SET name=?,type=?,description=?,date=?,time=?,location=?,capacity=?,price=?,
       emoji=?,bg_color=?,speakers=?,status=?,image_url=?,thumbnail=?,venue_name=?,start_date=?,
       is_online=?,online_url=?,category_id=?,refund_policy=?,tags=?,agenda=?,faq=?,updated_at=NOW()
       WHERE id=?`,
      [eventName, type||'Workshop', description||'', eventDate, eventTime, eventLocation,
       capacity||100, price||0, emoji||'🎫', bg_color||'#1a1510',
       JSON.stringify(Array.isArray(speakers)?speakers:[]), status||'active', eventImg, eventImg,
       eventLocation, eventDate ? `${eventDate} ${eventTime}:00` : null,
       is_online?1:0, online_url||null, category_id||null,
       refund_policy||'', JSON.stringify(tags||[]), JSON.stringify(agenda||[]), JSON.stringify(faq||[]),
       req.params.id]
    );

    // Cập nhật ticket_types nếu có gửi lên
    if (req.body.ticketTypes?.length) {
      await db.query('DELETE FROM ticket_types WHERE event_id=?', [req.params.id]);
      // Will update price after inserting new ticket_types
      for (const tt of req.body.ticketTypes) {
        await db.query('INSERT INTO ticket_types(event_id,name,type,price,quantity,max_per_order,description) VALUES(?,?,?,?,?,?,?)',
          [req.params.id, tt.name||'Vé thường', tt.type||'paid', tt.price||0, tt.quantity||100, tt.max_per_order||5, tt.description||'']);
      }
    }

    const [r] = await db.query('SELECT * FROM events WHERE id=?', [req.params.id]);
    res.json({ success: true, data: parse(r[0]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /api/events/:id
exports.remove = async (req, res) => {
  try {
    await db.query('DELETE FROM events WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa Event' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PATCH /api/events/:id/featured
exports.toggleFeatured = async (req, res) => {
  try {
    const [[ev]] = await db.query('SELECT is_featured FROM events WHERE id=?', [req.params.id]);
    await db.query('UPDATE events SET is_featured=? WHERE id=?', [ev.is_featured?0:1, req.params.id]);
    res.json({ success: true, message: ev.is_featured?'Đã bỏ nổi bật':'Đã đánh dấu nổi bật' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PATCH /api/events/:id/publish
exports.togglePublish = async (req, res) => {
  try {
    const [[ev]] = await db.query('SELECT status FROM events WHERE id=?', [req.params.id]);
    const next = ['active','published'].includes(ev.status) ? 'draft' : 'active';
    await db.query('UPDATE events SET status=? WHERE id=?', [next, req.params.id]);
    res.json({ success: true, message: next==='active'?'Đã xuất bản':'Đã chuyển về nháp' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /api/events/:id/favorite
exports.toggleFavorite = async (req, res) => {
  try {
    const [ex] = await db.query('SELECT 1 FROM favorites WHERE user_id=? AND event_id=?', [req.user.id, req.params.id]);
    if (ex.length) { await db.query('DELETE FROM favorites WHERE user_id=? AND event_id=?', [req.user.id, req.params.id]); res.json({ success:true, isFavorite:false }); }
    else { await db.query('INSERT INTO favorites(user_id,event_id) VALUES(?,?)', [req.user.id, req.params.id]); res.json({ success:true, isFavorite:true }); }
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /api/events/:id/review
exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating||rating<1||rating>5) return res.status(400).json({ success:false, message:'Đánh giá từ 1-5 sao' });
    const [ex] = await db.query('SELECT id FROM reviews WHERE user_id=? AND event_id=?', [req.user.id, req.params.id]);
    if (ex.length) await db.query('UPDATE reviews SET rating=?,comment=? WHERE user_id=? AND event_id=?', [rating, comment||'', req.user.id, req.params.id]);
    else await db.query('INSERT INTO reviews(event_id,user_id,rating,comment) VALUES(?,?,?,?)', [req.params.id, req.user.id, rating, comment||'']);
    res.json({ success: true, message: 'Cảm ơn bạn đã đánh giá!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
