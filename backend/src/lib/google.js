// Autentikasi Google/Firebase untuk Cloudflare Workers (tanpa dependensi).
//  - getAccessToken : token OAuth dari service account (untuk Firestore & Identity Toolkit)
//  - verifyIdToken  : verifikasi Firebase ID Token milik pengguna
//  - fungsi Identity: buat/ubah/nonaktifkan akun, login password, refresh token
import { HttpError } from './http.js';

export const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const enc = new TextEncoder();

function b64urlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function pemToDer(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

// ---------- Token akses service account ----------

let cachedToken = null; // { token, exp }
let cachedKey = null; // { fingerprint, key }

export function resetGoogleCaches() {
  cachedToken = null;
  cachedKey = null;
  jwks = { keys: new Map(), fetchedAt: 0 };
}

function serviceAccount(env) {
  try {
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    if (!sa.client_email || !sa.private_key) throw new Error('kosong');
    return sa;
  } catch {
    throw new HttpError(500, 'Konfigurasi server belum lengkap (FIREBASE_SERVICE_ACCOUNT)', 'misconfigured');
  }
}

export async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 300 > now) return cachedToken.token;

  const sa = serviceAccount(env);
  if (!cachedKey || cachedKey.fingerprint !== sa.private_key_id) {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToDer(sa.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    cachedKey = { fingerprint: sa.private_key_id, key };
  }
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cachedKey.key, enc.encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${b64urlEncode(new Uint8Array(sig))}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  if (!res.ok) {
    console.error('Gagal mengambil access token', res.status, await res.text());
    throw new HttpError(500, 'Server tidak dapat terhubung ke Firebase. Periksa service account.', 'google_auth_failed');
  }
  const data = await res.json();
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

// ---------- Verifikasi Firebase ID Token ----------

let jwks = { keys: new Map(), fetchedAt: 0 };

async function loadKey(kid) {
  const now = Date.now();
  if (jwks.keys.has(kid)) return jwks.keys.get(kid);
  if (now - jwks.fetchedAt < 60000 && jwks.keys.size) return null; // jangan terlalu sering memuat ulang
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('Gagal memuat kunci publik Firebase');
  const { keys } = await res.json();
  const map = new Map();
  for (const jwk of keys) {
    map.set(
      jwk.kid,
      await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
    );
  }
  jwks = { keys: map, fetchedAt: now };
  return map.get(kid) || null;
}

export async function verifyIdToken(env, token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('format token salah');
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('algoritma tidak valid');

  const key = await loadKey(header.kid);
  if (!key) throw new Error('kunci tidak dikenal');
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(parts[2]),
    enc.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new Error('tanda tangan tidak cocok');

  const now = Math.floor(Date.now() / 1000);
  const pid = env.FIREBASE_PROJECT_ID;
  if (payload.aud !== pid) throw new Error('audience salah');
  if (payload.iss !== `https://securetoken.google.com/${pid}`) throw new Error('issuer salah');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('subject kosong');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('token kedaluwarsa');
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) throw new Error('iat tidak valid');
  return payload;
}

// ---------- Identity Toolkit (kelola akun) ----------

async function identityAdmin(env, path, body) {
  const token = await getAccessToken(env);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.firebaseCode = String(message).split(' ')[0];
    throw err;
  }
  return data;
}

export function emailFor(env, usernameLower) {
  return `${usernameLower}@${env.EMAIL_DOMAIN || 'zeii-ebook.local'}`;
}

export async function createAuthUser(env, { username, password, displayName }) {
  try {
    const data = await identityAdmin(env, 'accounts', { email: emailFor(env, username), password, displayName });
    return data.localId;
  } catch (e) {
    if (e.firebaseCode === 'EMAIL_EXISTS') throw new HttpError(409, 'Username sudah dipakai', 'username_taken');
    if (e.firebaseCode === 'WEAK_PASSWORD' || /PASSWORD/.test(e.message)) throw new HttpError(400, 'Password terlalu lemah', 'weak_password');
    console.error('createAuthUser gagal', e.message);
    throw new HttpError(502, 'Gagal membuat akun di Firebase Authentication', 'auth_create_failed');
  }
}

/** Cari akun Auth (berdasar uid atau username). Mengembalikan uid, atau null bila tidak ada. Galat jaringan dilempar, bukan dianggap "tidak ada". */
export async function lookupAuthUid(env, { uid, username }) {
  const body = uid ? { localId: [uid] } : { email: [emailFor(env, username)] };
  const data = await identityAdmin(env, 'accounts:lookup', body);
  return data.users?.[0]?.localId || null;
}

export async function updateAuthUser(env, uid, fields) {
  try {
    await identityAdmin(env, 'accounts:update', { localId: uid, ...fields });
  } catch (e) {
    console.error('updateAuthUser gagal', e.message);
    throw new HttpError(502, 'Gagal memperbarui akun di Firebase Authentication', 'auth_update_failed');
  }
}

export async function deleteAuthUser(env, uid) {
  try {
    await identityAdmin(env, 'accounts:delete', { localId: uid });
  } catch (e) {
    console.error('deleteAuthUser gagal', e.message);
  }
}

// ---------- Login & refresh (memakai Web API Key, bukan rahasia) ----------

function mapSignInError(code) {
  switch (code) {
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_PASSWORD':
    case 'EMAIL_NOT_FOUND':
      return new HttpError(401, 'Username atau password salah', 'bad_credentials');
    case 'USER_DISABLED':
      return new HttpError(403, 'Akun ini dinonaktifkan. Hubungi admin Zeii Ebook.', 'disabled');
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return new HttpError(429, 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.', 'rate_limited');
    default:
      return new HttpError(502, 'Layanan login sedang bermasalah. Coba lagi nanti.', 'auth_unavailable');
  }
}

export async function signInWithPassword(env, usernameLower, password) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: emailFor(env, usernameLower), password, returnSecureToken: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw mapSignInError(String(data?.error?.message || '').split(' ')[0]);
  return { uid: data.localId, idToken: data.idToken, refreshToken: data.refreshToken, expiresIn: Number(data.expiresIn) };
}

export async function refreshIdToken(env, refreshToken) {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String(data?.error?.message || '');
    if (code.startsWith('USER_DISABLED')) throw new HttpError(403, 'Akun ini dinonaktifkan.', 'disabled');
    throw new HttpError(401, 'Sesi sudah berakhir. Silakan login lagi.', 'refresh_failed');
  }
  return { uid: data.user_id, idToken: data.id_token, refreshToken: data.refresh_token, expiresIn: Number(data.expires_in) };
}
