// Admin mengelola pembaca: lihat, nonaktifkan, reset password.
import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { requireAdmin } from '../lib/guard.js';
import { updateAuthUser } from '../lib/google.js';
import { op } from '../lib/firestore.js';
import { userOut } from '../lib/models.js';

export async function list(ctx) {
  requireAdmin(ctx);
  const users = await ctx.fs.list('users');
  return { users: users.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).map(userOut) };
}

async function target(ctx) {
  requireAdmin(ctx);
  const u = await ctx.fs.get(`users/${ctx.params.uid}`);
  if (!u) throw new HttpError(404, 'Pengguna tidak ditemukan', 'not_found');
  if (u.role === 'admin') throw new HttpError(403, 'Akun admin tidak bisa diubah dari sini', 'forbidden');
  return u;
}

export async function setActive(ctx) {
  const u = await target(ctx);
  const b = await ctx.json();
  const active = v.bool(b.active, 'Status');
  await updateAuthUser(ctx.env, u.id, { disableUser: !active });
  await ctx.fs.commit([op.update(`users/${u.id}`, { active })]);
  return { ok: true, active };
}

export async function resetPassword(ctx) {
  const u = await target(ctx);
  const b = await ctx.json();
  const password = v.password(b.newPassword, 'Password baru');
  await updateAuthUser(ctx.env, u.id, { password });
  return { ok: true };
}
