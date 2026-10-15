import { useCallback, useEffect, useState } from 'react';
import { Page, Button, Box, Text, List, useSnackbar } from 'zmp-ui';
import { getAccessToken, getPhoneNumber, getLocation } from 'zmp-sdk/apis';
import { api, ApiError, tokenStore } from '../api';

const fmt = (d) =>
  d ? new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

const errMsg = (e) => (e && e.message) || 'Có lỗi xảy ra, vui lòng thử lại';

const ROLE_LABEL = {
  trainer: 'Huấn luyện viên', reception: 'Lễ tân', cleaner: 'Vệ sinh', manager: 'Quản lý',
};

// Tháng hiện tại theo giờ Việt Nam (UTC+7)
const vnMonthNow = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
const shiftMonth = (m, delta) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const inputStyle = {
  width: '100%', padding: '12px 14px', marginTop: 6, marginBottom: 12,
  borderRadius: 12, border: '1px solid #ccc', fontSize: 16,
  boxSizing: 'border-box', background: '#fff',
};

// ===== Quản lý: ai đang có mặt + báo cáo giờ làm theo tháng =====
function ReportView({ toast }) {
  const [month, setMonth] = useState(vnMonthNow());
  const [present, setPresent] = useState([]);
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api('/api/admin/present'), api(`/api/admin/report?month=${month}`)])
      .then(([p, r]) => { if (alive) { setPresent(p); setReport(r); } })
      .catch((e) => toast(errMsg(e), 'error'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month]);

  const totalHours = report.reduce((s, r) => s + Number(r.hours || 0), 0);

  return (
    <Box mt={4}>
      <Text.Title>Đang có mặt ({present.length})</Text.Title>
      {present.length === 0 ? (
        <Text>{loading ? 'Đang tải...' : 'Hiện không có ai đang làm.'}</Text>
      ) : (
        <List>
          {present.map((p, i) => (
            <List.Item
              key={i}
              title={p.name}
              subTitle={`${ROLE_LABEL[p.role] || p.role} · vào lúc ${fmt(p.check_in)}`}
            />
          ))}
        </List>
      )}

      <Box mt={6}>
        <Text.Title>Báo cáo tháng {month}</Text.Title>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
          <Button size="small" variant="secondary" onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹ Tháng trước
          </Button>
          <Button size="small" variant="secondary" onClick={() => setMonth(shiftMonth(month, 1))}>
            Tháng sau ›
          </Button>
        </div>
        <Text>Tổng: {totalHours.toFixed(1)} giờ</Text>
        <List>
          {report.map((r, i) => (
            <List.Item
              key={i}
              title={`${r.name} (${ROLE_LABEL[r.role] || r.role})`}
              subTitle={`${Number(r.hours).toFixed(1)} giờ · ${r.punches} lượt`}
            />
          ))}
        </List>
      </Box>
    </Box>
  );
}

// ===== Quản lý: thêm, khóa, đặt lại Zalo cho nhân viên =====
function StaffView({ toast }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null = form đóng
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      setList(await api('/api/admin/employees'));
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const save = async () => {
    try {
      setSaving(true);
      await api('/api/admin/employees', { body: form });
      toast('Đã thêm nhân viên', 'success');
      setForm(null);
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const act = async (id, path, body, okText) => {
    try {
      await api(`/api/admin/employees/${id}/${path}`, { body });
      toast(okText, 'success');
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Box mt={4}>
      <Text.Title>Nhân viên ({list.filter((x) => x.active).length})</Text.Title>

      {form ? (
        <Box mt={2}>
          <label>
            Họ tên
            <input
              style={inputStyle}
              value={form.name}
              onChange={(ev) => setForm({ ...form, name: ev.target.value })}
            />
          </label>
          <label>
            Số điện thoại Zalo
            <input
              style={inputStyle}
              type="tel"
              inputMode="numeric"
              placeholder="0901234567"
              value={form.phone}
              onChange={(ev) => setForm({ ...form, phone: ev.target.value })}
            />
          </label>
          <label>
            Chức vụ
            <select
              style={inputStyle}
              value={form.role}
              onChange={(ev) => setForm({ ...form, role: ev.target.value })}
            >
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button fullWidth loading={saving} onClick={save}>Lưu</Button>
            <Button fullWidth variant="secondary" onClick={() => setForm(null)}>Hủy</Button>
          </div>
        </Box>
      ) : (
        <Box mt={2}>
          <Button fullWidth variant="secondary" onClick={() => setForm({ name: '', phone: '', role: 'trainer' })}>
            + Thêm nhân viên
          </Button>
        </Box>
      )}

      <Box mt={4}>
        {loading && <Text>Đang tải...</Text>}
        {list.map((emp) => (
          <div
            key={emp.id}
            style={{ padding: '12px 0', borderBottom: '1px solid #e5e5e5', opacity: emp.active ? 1 : 0.5 }}
          >
            <div style={{ fontWeight: 600 }}>{emp.name}</div>
            <Text size="small">
              {`${ROLE_LABEL[emp.role] || emp.role} · ${emp.phone} · ${emp.linked ? 'Đã liên kết Zalo' : 'Chưa đăng nhập'}${emp.active ? '' : ' · Đã khóa'}`}
            </Text>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button
                size="small"
                variant="secondary"
                onClick={() => act(emp.id, 'active', { active: !emp.active }, emp.active ? 'Đã khóa' : 'Đã mở khóa')}
              >
                {emp.active ? 'Khóa' : 'Mở khóa'}
              </Button>
              {emp.linked && (
                <Button
                  size="small"
                  variant="tertiary"
                  onClick={() => act(emp.id, 'reset-zalo', {}, 'Đã đặt lại liên kết Zalo')}
                >
                  Đặt lại Zalo
                </Button>
              )}
            </div>
          </div>
        ))}
      </Box>
    </Box>
  );
}

// ===== Khu vực quản lý: chuyển giữa Báo cáo và Nhân viên =====
function AdminView({ toast }) {
  const [tab, setTab] = useState('report'); // report | staff
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button size="small" variant={tab === 'report' ? 'primary' : 'secondary'} onClick={() => setTab('report')}>
          Báo cáo
        </Button>
        <Button size="small" variant={tab === 'staff' ? 'primary' : 'secondary'} onClick={() => setTab('staff')}>
          Nhân viên
        </Button>
      </div>
      {tab === 'report' ? <ReportView toast={toast} /> : <StaffView toast={toast} />}
    </>
  );
}

export default function Home() {
  const { openSnackbar } = useSnackbar();
  const [status, setStatus] = useState('loading'); // loading | out | in
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('me'); // me = chấm công, admin = quản lý

  const toast = (text, type = 'default') => openSnackbar({ text, type });

  const load = useCallback(async () => {
    try {
      setData(await api('/api/me/history'));
      setStatus('in');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setStatus('out');
      else throw e;
    }
  }, []);

  useEffect(() => {
    if (!tokenStore.get()) { setStatus('out'); return; }
    load().catch((e) => { setStatus('out'); toast(errMsg(e), 'error'); });
  }, [load]);

  const login = async () => {
    try {
      setBusy(true);
      const accessToken = await getAccessToken();
      const { token: phoneToken } = await getPhoneNumber();
      if (!phoneToken) throw new Error('Không lấy được số điện thoại từ Zalo');
      const r = await api('/api/login', { body: { accessToken, phoneToken } });
      tokenStore.set(r.token);
      await load();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const punch = async () => {
    try {
      setBusy(true);
      const accessToken = await getAccessToken();
      const { token: locationToken } = await getLocation();
      if (!locationToken) throw new Error('Không lấy được vị trí, hãy bật định vị');
      const r = await api('/api/punch', { body: { accessToken, locationToken } });
      toast(r.action === 'check_in' ? 'Đã check-in' : 'Đã check-out', 'success');
      await load();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    tokenStore.clear();
    setData(null);
    setView('me');
    setStatus('out');
  };

  if (status === 'loading') return <Page className="p-4"><Text>Đang tải...</Text></Page>;

  if (status === 'out' || !data) {
    return (
      <Page className="p-4">
        <Box mt={10} mb={6}><Text.Title>Chấm công Gym</Text.Title></Box>
        <Button fullWidth loading={busy} onClick={login}>Đăng nhập bằng Zalo</Button>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Text size="small">
            Ứng dụng cần số điện thoại Zalo để xác minh danh tính của bạn
          </Text>
        </div>
      </Page>
    );
  }

  return (
    <Page className="p-4">
      <Text.Title>Xin chào {data.name}</Text.Title>

      {data.role === 'manager' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button size="small" variant={view === 'me' ? 'primary' : 'secondary'} onClick={() => setView('me')}>
            Chấm công
          </Button>
          <Button size="small" variant={view === 'admin' ? 'primary' : 'secondary'} onClick={() => setView('admin')}>
            Quản lý
          </Button>
        </div>
      )}

      {view === 'admin' && data.role === 'manager' ? (
        <AdminView toast={toast} />
      ) : (
        <>
          <Text>Tháng này: {data.total_hours} giờ</Text>

          <Box mt={4}>
            <Button
              fullWidth
              size="large"
              loading={busy}
              variant={data.working ? 'secondary' : 'primary'}
              onClick={punch}
            >
              {data.working ? 'Check-out' : 'Check-in'}
            </Button>
          </Box>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Text size="small">
              Ứng dụng dùng vị trí của bạn để xác nhận bạn đang ở phòng gym khi check-in và check-out.
            </Text>
          </div>

          <Box mt={4}>
            {data.rows.length === 0 ? (
              <Text>Tháng này chưa có lượt chấm công nào.</Text>
            ) : (
              <List>
                {data.rows.map((r) => (
                  <div
                    key={r.id}
                    style={{ border: '1px solid #000', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}
                  >
                    <List.Item
                      title={`Vào: ${fmt(r.check_in)}`}
                      subTitle={`Ra: ${fmt(r.check_out)}${r.hours ? ` (${Number(r.hours).toFixed(1)}h)` : ''}`}
                    />
                  </div>
                ))}
              </List>
            )}
          </Box>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
        <Button variant="tertiary" style={{ border: '1px solid #006af5' }} onClick={logout}>
          Đăng xuất
        </Button>
      </div>
    </Page>
  );
}
