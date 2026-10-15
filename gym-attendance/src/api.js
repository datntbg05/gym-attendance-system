import { nativeStorage } from 'zmp-sdk/apis';

// Dev: API chạy trên máy bạn. Khi chạy thật đổi sang https://api.ten-mien-cua-ban.com
export const API_BASE = 'https://api.ten-mien-cua-ban.com';

export const tokenStore = {
  get: () => {
    try { return nativeStorage.getItem('jwt') || localStorage.getItem('jwt') || null; }
    catch { return null; }
  },
  set: (t) => {
    try { nativeStorage.setItem('jwt', t); } catch { localStorage.setItem('jwt', t); }
  },
  clear: () => {
    try { nativeStorage.removeItem('jwt'); } catch { /* bỏ qua */ }
    try { localStorage.removeItem('jwt'); } catch { /* bỏ qua */ }
  },
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, opts = {}) {
  const token = tokenStore.get();
  const res = await fetch(API_BASE + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let json = null;
  try { json = await res.json(); } catch { /* phản hồi không phải JSON */ }

  if (!res.ok) {
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(res.status, (json && json.error) || 'Không kết nối được máy chủ');
  }
  return json;
}