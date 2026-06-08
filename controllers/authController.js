const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin' });
    const [ex] = await db.query('SELECT id FROM users WHERE email=?', [email]);
    if (ex.length) return res.status(400).json({ success: false, message: 'Email đã được sử dụng' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      'INSERT INTO users(name,email,password,phone,role) VALUES(?,?,?,?,?)',
      [name, email, hash, phone||null, 'user']
    );
    const user = { id: r.insertId, name, email, role: 'user', phone: phone||null };
    res.status(201).json({ success: true, token: sign(r.insertId), user });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu' });
    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email]);
    if (!rows.length) return res.status(401).json({ success: false, message: 'Email không tồn tại' });
    const u = rows[0];
    if (u.is_locked) return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa' });
    const ok = await bcrypt.compare(password, u.password);
    if (!ok) return res.status(401).json({ success: false, message: 'Mật khẩu không đúng' });
    res.json({
      success: true,
      token: sign(u.id),
      user: { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, avatar: u.avatar }
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getMe = async (req, res) => {
  try {
    const [[u]] = await db.query('SELECT id,name,email,phone,avatar,role,created_at FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, user: u });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Tên không được để trống' });
    await db.query(
      'UPDATE users SET name=?, phone=?, avatar=?, updated_at=NOW() WHERE id=?',
      [name.trim(), phone||null, avatar||null, req.user.id]
    );
    const [[u]] = await db.query('SELECT id,name,email,phone,avatar,role FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, message: 'Cập nhật hồ sơ Success!', user: u });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.changePassword = async (req, res) => {
  try {
    const current_password = req.body.current_password || req.body.currentPassword;
    const new_password = req.body.new_password || req.body.newPassword;
    if (!current_password || !new_password)
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ' });
    if (new_password.length < 6)
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải ít nhất 6 ký tự' });
    const [[u]] = await db.query('SELECT password FROM users WHERE id=?', [req.user.id]);
    const ok = await bcrypt.compare(current_password, u.password);
    if (!ok) return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password=? WHERE id=?', [hash, req.user.id]);
    res.json({ success: true, message: 'Đổi mật khẩu Success!' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
};
