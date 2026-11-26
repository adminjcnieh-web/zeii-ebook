import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { signInWithPassword, refreshIdToken, updateAuthUser, createAuthUser, deleteAuthUser } from '../lib/google.js';
import { rateLimit } from '../lib/ratelimit.js';
import { userOut } from '../lib/models.js';
import { op, FirestoreError } from '../lib/firestore.js';

const clientIp = (request) => request.headers.get('cf-connecting-ip') || 'local';

async function loadActiveUser(ctx, uid) {
  const user = await ctx.fs.get(`users/${uid}`);
  if (!user) throw new HttpError(403, 'Akun belum terdaftar di Zeii Ebook', 'no_profile');
  if (!user.active) throw new HttpError(403, 'Akun ini dinonaktifkan. Hubungi admin Zeii Ebook.', 'disabled');
  return user;
}

/** Pembaca mendaftar sendiri. Selalu berperan "reader"; admin hanya bisa dibuat lewat skrip. */
export async function register(ctx) {
  if (String(ctx.env.REGISTRATION || '').toLowerCase() === 'closed') throw new HttpError(403, 'Pendaftaran sedang ditutup', 'registration_closed');
  rateLimit(`register-ip:${clientIp(ctx.request)}`, 6, 10 * 60000);
  const b = await ctx.json();
  const username = v.username(b.username);
  const fullName = v.str(b.fullName, { name: 'Nama', min: 2, max: 40 });
  const password = v.password(b.password);
  if (await ctx.fs.get(`usernames/${username}`)) throw new HttpError(409, 'Username sudah dipakai, coba yang lain', 'username_taken');
  const uid = await createAuthUser(ctx.env, { username, password, displayName: fullName });
  const data = { fullName, username, usernameLower: username, role: 'reader', active: true, joinedAt: ctx.now.toISOString().slice(0, 10), createdAt: ctx.now };
  try {
    await ctx.fs.commit([op.create(`usernames/${username}`, { uid, createdAt: ctx.now }), op.create(`users/${uid}`, data)]);
  } catch (e) {
    await deleteAuthUser(ctx.env, uid);
    if (e instanceof FirestoreError && e.code === 'ALREADY_EXISTS') throw new HttpError(409, 'Username sudah dipakai, coba yang lain', 'username_taken');
    throw e;
  }
  const session = await signInWithPassword(ctx.env, username, password);
  return { idToken: session.idToken, refreshToken: session.refreshToken, expiresIn: session.expiresIn, user: userOut({ id: uid, ...data }) };
}

export async function login(ctx) {
  rateLimit(`login-ip:${clientIp(ctx.request)}`, 20, 5 * 60000);
  const body = await ctx.json();
  const username = v.username(body.username);
  if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 100) throw new HttpError(400, 'Password wajib diisi', 'validation');
  rateLimit(`login-user:${username}`, 8, 5 * 60000);
  const session = await signInWithPassword(ctx.env, username, body.password);
  const user = await loadActiveUser(ctx, session.uid);
  return { idToken: session.idToken, refreshToken: session.refreshToken, expiresIn: session.expiresIn, user: userOut(user) };
}

export async function refresh(ctx) {
  rateLimit(`refresh-ip:${clientIp(ctx.request)}`, 60, 5 * 60000);
  const body = await ctx.json();
  const token = v.str(body.refreshToken, { name: 'Refresh token', min: 10, max: 2000 });
  const session = await refreshIdToken(ctx.env, token);
  await loadActiveUser(ctx, session.uid);
  return { idToken: session.idToken, refreshToken: session.refreshToken, expiresIn: session.expiresIn };
}

export async function me(ctx) {
  return { user: userOut({ id: ctx.auth.uid, ...ctx.auth.user }) };
}

export async function changePassword(ctx) {
  const body = await ctx.json();
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = v.password(body.newPassword, 'Password baru');
  if (!current) throw new HttpError(400, 'Password saat ini wajib diisi', 'validation');
  if (current === next) throw new HttpError(400, 'Password baru harus berbeda dari password lama', 'validation');
  rateLimit(`pw:${ctx.auth.uid}`, 5, 10 * 60000);
  await signInWithPassword(ctx.env, ctx.auth.user.usernameLower, current);
  await updateAuthUser(ctx.env, ctx.auth.uid, { password: next });
  return { ok: true, message: 'Password berhasil diganti. Silakan masuk lagi.' };
}

export async function rename(ctx) {
  const b = await ctx.json();
  const fullName = v.str(b.fullName, { name: 'Nama', min: 2, max: 40 });
  await ctx.fs.commit([op.update(`users/${ctx.auth.uid}`, { fullName })]);
  return { user: userOut({ id: ctx.auth.uid, ...ctx.auth.user, fullName }) };
}
