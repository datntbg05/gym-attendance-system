require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { DATABASE_URL, JWT_SECRET, ZALO_SECRET_KEY, CORS_ORIGINS } = process.env;
const PORT = Number(process.env.PORT) || 4000; // 3000 đã dùng cho zmp start

for (const [k, v] of Object.entries({ DATABASE_URL, JWT_SECRET, ZALO_SECRET_KEY })) {
  if (!v) { console.error(`Thiếu biến ${k} trong .env`); process.exit(1); }
}

const db = new Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(cors(CORS_ORIGINS ? { origin: CORS_ORIGINS.split(',').map((s) => s.trim()) } : undefined));
app.use(express.json());

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
// Express 4 không tự bắt lỗi async nên phải bọc lại
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Zalo ----------
// Đổi token (số điện thoại / vị trí) thành dữ liệu thật. Token dùng 1 lần, hết hạn sau 2 phút.
async function zaloDecode(accessToken, token) {
  if (!accessToken || !token) throw new HttpError(400, 'Thiếu token từ Zalo');
  const r = await fetch('https://graph.zalo.me/v2.0/me/info', {
    headers: { access_token: accessToken, code: token, secret_key: ZALO_SECRET_KEY },
  });
  const j = await r.json();
  if (j.error) throw new HttpError(400, j.message || 'Không giải mã được token Zalo');
  return j.data;
}

// Server tự hỏi Zalo để biết ID, không tin giá trị app gửi lên
async function zaloUserId(accessToken) {
  const r = await fetch('https://graph.zalo.me/v2.0/me?fields=id', {
    headers: { access_token: accessToken },
  });
  const j = await r.json();
  if (j.error || !j.id) throw new HttpError(400, 'Không lấy được tài khoản Zalo');
  return String(j.id);
}

// ---------- Tiện ích ----------
function distance(lat1, lng1, lat2, lng2) { // Haversine, đơn vị mét
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const ROLES = ['trainer', 'reception', 'cleaner', 'manager'];
const normPhone = (n) => String(n).replace(/\D/g, '').replace(/^0/, '84');
const parseMonth = (m) => (/^\d{4}-\d{2}$/.test(m || '') ? m : null); // null = tháng hiện tại
const VN_MONTH_NOW = `to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM')`;

// Kiểm tra JWT, rồi đọc lại nhân viên từ DB để chặn người đã nghỉ việc
const auth = wrap(async (req, _res, next) => {
  let payload;
  try {
    payload = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
  }
  const { rows: [emp] } = await db.query(
    'SELECT id, name, role, branch_id FROM employees WHERE id=$1 AND active', [payload.id]);
  if (!emp) throw new HttpError(401, 'Tài khoản không còn hoạt động');
  req.user = emp;
  next();
});

const managerOnly = (req, _res, next) =>
  req.user.role === 'manager' ? next() : next(new HttpError(403, 'Không có quyền'));

// ---------- Nhân viên ----------
app.post('/api/login', wrap(async (req, res) => {
  const { accessToken, phoneToken } = req.body;
  const { number } = await zaloDecode(accessToken, phoneToken);
  const zaloId = await zaloUserId(accessToken);
  const phone = normPhone(number);

  const { rows: [emp] } = await db.query(
    'SELECT * FROM employees WHERE phone=$1 AND active', [phone]);
  if (!emp) throw new HttpError(403, 'Số điện thoại chưa có trong danh sách nhân viên');

  if (emp.zalo_id && emp.zalo_id !== zaloId)
    throw new HttpError(403, 'Tài khoản đã gắn với Zalo khác, liên hệ quản lý để đặt lại');
  if (!emp.zalo_id) {
    const r = await db.query(
      'UPDATE employees SET zalo_id=$1 WHERE id=$2 AND zalo_id IS NULL', [zaloId, emp.id]);
    if (!r.rowCount) throw new HttpError(409, 'Vui lòng thử đăng nhập lại');
  }

  const token = jwt.sign({ id: emp.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, name: emp.name, role: emp.role });
}));

app.post('/api/punch', auth, wrap(async (req, res) => {
  const { accessToken, locationToken } = req.body;
  const loc = await zaloDecode(accessToken, locationToken);
  const lat = Number(loc.latitude), lng = Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    throw new HttpError(400, 'Không đọc được vị trí, hãy bật định vị và thử lại');

  const { rows: [b] } = await db.query('SELECT * FROM branches WHERE id=$1', [req.user.branch_id]);
  if (!b) throw new HttpError(400, 'Bạn chưa được gán chi nhánh, liên hệ quản lý');

  const d = distance(lat, lng, b.lat, b.lng);
  if (d > b.radius_m)
    throw new HttpError(400, `Bạn đang cách ${b.name} khoảng ${Math.round(d)}m (cho phép ${b.radius_m}m)`);

  const { rows: [open] } = await db.query(
    'SELECT id FROM attendance WHERE employee_id=$1 AND check_out IS NULL ORDER BY id DESC LIMIT 1',
    [req.user.id]);

  if (open) {
    await db.query(
      'UPDATE attendance SET check_out=now(), out_lat=$1, out_lng=$2 WHERE id=$3 AND check_out IS NULL',
      [lat, lng, open.id]);
    return res.json({ action: 'check_out' });
  }
  try {
    await db.query(
      'INSERT INTO attendance (employee_id, in_lat, in_lng) VALUES ($1,$2,$3)',
      [req.user.id, lat, lng]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Bạn đã check-in rồi, hãy tải lại trang');
    throw e;
  }
  res.json({ action: 'check_in' });
}));

app.get('/api/me/history', auth, wrap(async (req, res) => {
  const month = parseMonth(req.query.month);
  const { rows } = await db.query(
    `SELECT id, check_in, check_out,
            EXTRACT(EPOCH FROM (check_out - check_in))/3600 AS hours
     FROM attendance
     WHERE employee_id=$1
       AND to_char(check_in AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM') = COALESCE($2::text, ${VN_MONTH_NOW})
     ORDER BY check_in DESC`, [req.user.id, month]);

  const { rowCount: openCount } = await db.query(
    'SELECT 1 FROM attendance WHERE employee_id=$1 AND check_out IS NULL LIMIT 1', [req.user.id]);

  const total = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  res.json({
    name: req.user.name, role: req.user.role,
    rows, total_hours: Number(total.toFixed(2)), working: openCount > 0,
  });
}));

// ---------- Quản lý ----------
app.get('/api/admin/present', auth, managerOnly, wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT e.name, e.role, a.check_in FROM attendance a
     JOIN employees e ON e.id=a.employee_id
     WHERE a.check_out IS NULL AND e.active ORDER BY a.check_in`);
  res.json(rows);
}));

app.get('/api/admin/report', auth, managerOnly, wrap(async (req, res) => {
  const month = parseMonth(req.query.month);
  const { rows } = await db.query(
    `SELECT e.name, e.role,
            COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (a.check_out - a.check_in))/3600)::numeric, 2), 0) AS hours,
            COUNT(a.id) AS punches
     FROM employees e
     LEFT JOIN attendance a ON a.employee_id=e.id
       AND to_char(a.check_in AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM') = COALESCE($1::text, ${VN_MONTH_NOW})
     WHERE e.active
     GROUP BY e.id ORDER BY e.name`, [month]);
  res.json(rows);
}));

// Danh sách toàn bộ nhân viên (cả người đã khóa)
app.get('/api/admin/employees', auth, managerOnly, wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, phone, role, active, (zalo_id IS NOT NULL) AS linked
     FROM employees ORDER BY active DESC, name`);
  res.json(rows);
}));

// Thêm nhân viên mới (cùng chi nhánh với quản lý đang thêm)
app.post('/api/admin/employees', auth, managerOnly, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = normPhone(req.body.phone || '');
  const { role } = req.body;
  if (!name || name.length > 100) throw new HttpError(400, 'Tên không hợp lệ');
  if (!/^84\d{9}$/.test(phone)) throw new HttpError(400, 'Số điện thoại không hợp lệ (ví dụ 0901234567)');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Chức vụ không hợp lệ');
  if (!req.user.branch_id) throw new HttpError(400, 'Tài khoản quản lý chưa được gán chi nhánh');
  try {
    await db.query(
      'INSERT INTO employees (name, phone, role, branch_id) VALUES ($1,$2,$3,$4)',
      [name, phone, role, req.user.branch_id]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Số điện thoại này đã có trong danh sách');
    throw e;
  }
  res.status(201).json({ ok: true });
}));

// Khóa hoặc mở khóa nhân viên (không xóa để giữ lịch sử chấm công)
app.post('/api/admin/employees/:id/active', auth, managerOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const active = req.body.active === true;
  if (!Number.isInteger(id)) throw new HttpError(400, 'Mã nhân viên không hợp lệ');
  if (id === req.user.id && !active) throw new HttpError(400, 'Bạn không thể tự khóa tài khoản của mình');
  const r = await db.query('UPDATE employees SET active=$1 WHERE id=$2', [active, id]);
  if (!r.rowCount) throw new HttpError(404, 'Không tìm thấy nhân viên');
  res.json({ ok: true });
}));

// Đặt lại liên kết Zalo (khi nhân viên đổi điện thoại hoặc đổi tài khoản Zalo)
app.post('/api/admin/employees/:id/reset-zalo', auth, managerOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Mã nhân viên không hợp lệ');
  const r = await db.query('UPDATE employees SET zalo_id=NULL WHERE id=$1', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Không tìm thấy nhân viên');
  res.json({ ok: true });
}));

// ---------- Xử lý lỗi chung ----------
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Lỗi máy chủ' : err.message });
});

app.listen(PORT, () => console.log(`API :${PORT}`));