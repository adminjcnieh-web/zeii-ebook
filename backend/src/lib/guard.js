// Autentikasi (ID Token) dan otorisasi. Semua dicek di server; peran dibaca dari database, bukan dari browser.
import { HttpError } from './http.js';
import { verifyIdToken } from './google.js';
import { rateLimit } from './ratelimit.js';

export async function authenticate(ctx) {
  const header = ctx.request.headers.get('authorization') || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw new HttpError(401, 'Silakan masuk dulu', 'unauthenticated');
  let payload;
  try {
    payload = await verifyIdToken(ctx.env, match[1]);
  } catch {
    throw new HttpError(401, 'Sesi login tidak valid atau sudah habis. Silakan masuk lagi.', 'token_invalid');
  }
  rateLimit(`api:${payload.sub}`, 300, 60000);
  const user = await ctx.fs.get(`users/${payload.sub}`);
  if (!user) throw new HttpError(403, 'Akun belum terdaftar di Zeii Ebook', 'no_profile');
  if (!user.active) throw new HttpError(403, 'Akun ini dinonaktifkan. Hubungi admin Zeii Ebook.', 'disabled');
  return { uid: payload.sub, user };
}

export const isAdmin = (user) => user.role === 'admin';

export function requireAdmin(ctx) {
  if (!isAdmin(ctx.auth.user)) throw new HttpError(403, 'Hanya admin yang boleh melakukan ini', 'forbidden');
}
