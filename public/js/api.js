// Klien API: mengelola token login, memperbarui sesi otomatis, dan menerjemahkan error.
import { API_BASE } from './config.js';

const KEY = 'zeii.session.v1';
let memory = null;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return memory;
  }
}
function writeStore(value) {
  memory = value;
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    /* penyimpanan diblokir: sesi hanya hidup selama halaman terbuka */
  }
}

let session = readStore();

export const getSession = () => session;
export function setSession(s) {
  session = s;
  writeStore(s);
}
export function clearSession() {
  session = null;
  writeStore(null);
}
export function updateUser(user) {
  if (session) setSession({ ...session, user });
}

export function startSession({ idToken, refreshToken, expiresIn, user }) {
  setSession({ idToken, refreshToken, user, expiresAt: Date.now() + expiresIn * 1000 });
}

function emitLogout(reason) {
  window.dispatchEvent(new CustomEvent('zeii:logout', { detail: { reason } }));
}

async function rawFetch(method, path, body, token) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Tidak dapat terhubung ke server. Periksa koneksi internetmu lalu coba lagi.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respons bukan JSON */
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code || 'error', data?.error?.message || `Terjadi kesalahan (${res.status}).`);
  }
  return data;
}

let refreshing = null;
async function refreshSession() {
  if (!session?.refreshToken) throw new ApiError(401, 'no_session', 'Sesi berakhir. Silakan masuk lagi.');
  if (!refreshing) {
    refreshing = rawFetch('POST', '/api/auth/refresh', { refreshToken: session.refreshToken })
      .then((r) => setSession({ ...session, idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: Date.now() + r.expiresIn * 1000 }))
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function api(method, path, body) {
  if (!session) throw new ApiError(401, 'no_session', 'Silakan masuk dulu.');
  try {
    if (session.expiresAt - Date.now() < 60000) await refreshSession();
    try {
      return await rawFetch(method, path, body, session.idToken);
    } catch (e) {
      if (e.status === 401 && e.code === 'token_invalid') {
        await refreshSession();
        return await rawFetch(method, path, body, session.idToken);
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof ApiError && ((e.status === 401 && e.code !== 'bad_credentials') || e.code === 'disabled' || e.code === 'refresh_failed' || e.code === 'no_profile')) {
      if (session) {
        clearSession();
        emitLogout(e.code === 'disabled' ? e.message : 'Sesi berakhir. Silakan masuk lagi.');
      }
    }
    throw e;
  }
}

/** Mengambil file biner (mis. foto profil) dengan token login. */
export async function blob(path) {
  if (!session) throw new ApiError(401, 'no_session', 'Silakan masuk dulu.');
  const go = () => fetch(API_BASE + path, { headers: { authorization: `Bearer ${session.idToken}` } });
  if (session.expiresAt - Date.now() < 60000) await refreshSession();
  let res;
  try { res = await go(); } catch { throw new ApiError(0, 'network', 'Tidak dapat terhubung ke server.'); }
  if (res.status === 401) { await refreshSession(); res = await go(); }
  if (!res.ok) throw new ApiError(res.status, 'error', 'Gambar tidak tersedia');
  return res.blob();
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const put = (p, b = {}) => api('PUT', p, b);
export const patch = (p, b = {}) => api('PATCH', p, b);
export const del = (p) => api('DELETE', p);

export async function login(username, password) {
  const r = await rawFetch('POST', '/api/auth/login', { username: String(username).trim().toLowerCase(), password });
  startSession(r);
  return r.user;
}

export function logout() {
  clearSession();
}

export async function register(username, fullName, password) {
  const r = await rawFetch('POST', '/api/auth/register', { username: String(username).trim().toLowerCase(), fullName, password });
  startSession(r);
  return r.user;
}

/** Hapus dengan isi (jarang dipakai). */
export const delBody = (p, b) => api('DELETE', p, b);
