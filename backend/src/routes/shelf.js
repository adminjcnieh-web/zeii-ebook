// Rak pembaca: favorit + progres baca (bab terakhir dan posisi gulir 0..1). Satu dokumen per pembaca per novel.
import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { rateLimit } from '../lib/ratelimit.js';
import { op } from '../lib/firestore.js';
import { novelOut, ID_RE } from '../lib/models.js';
import { loadNovel } from './novels.js';
import { isAdmin } from '../lib/guard.js';

export async function list(ctx) {
  const rows = await ctx.fs.query('shelves', { where: [['uid', '==', ctx.auth.uid]] });
  if (!rows.length) return { items: [] };
  const admin = isAdmin(ctx.auth.user);
  const novels = new Map((await ctx.fs.list('novels')).filter((n) => admin || n.published).map((n) => [n.id, n]));
  const chapters = new Map();
  for (const r of rows) if (r.chapterId && !chapters.has(r.chapterId)) chapters.set(r.chapterId, await ctx.fs.get(`chapters/${r.chapterId}`));
  const items = rows
    .filter((r) => novels.has(r.novelId))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((r) => {
      const c = r.chapterId ? chapters.get(r.chapterId) : null;
      return { novelId: r.novelId, fav: !!r.fav, chapterId: c ? c.id : null, chapterNo: c?.no || null, chapterTitle: c?.title || null, pos: r.pos || 0, updatedAt: r.updatedAt, novel: novelOut(novels.get(r.novelId)) };
    });
  return { items };
}

export async function put(ctx) {
  rateLimit(`shelf:${ctx.auth.uid}`, 60, 60000);
  const n = await loadNovel(ctx, ctx.params.novelId);
  const b = await ctx.json();
  const patch = { uid: ctx.auth.uid, novelId: n.id, updatedAt: ctx.now };
  if (b.fav !== undefined) patch.fav = v.bool(b.fav, 'Favorit');
  if (b.chapterId !== undefined) {
    if (!ID_RE.test(b.chapterId || '')) throw new HttpError(400, 'Bab tidak valid', 'validation');
    const c = await ctx.fs.get(`chapters/${b.chapterId}`);
    if (!c || c.novelId !== n.id || (c.published === false && !isAdmin(ctx.auth.user))) throw new HttpError(404, 'Bab tidak ditemukan', 'not_found');
    patch.chapterId = c.id;
    patch.pos = 0;
  }
  if (b.pos !== undefined) {
    const p = Number(b.pos);
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new HttpError(400, 'Posisi baca tidak valid', 'validation');
    patch.pos = Math.round(p * 1000) / 1000;
  }
  const path = `shelves/${ctx.auth.uid}_${n.id}`;
  const old = await ctx.fs.get(path);
  await ctx.fs.commit([op.set(path, { fav: false, ...(old || {}), ...patch })]);
  return { ok: true };
}

export async function remove(ctx) {
  if (!ID_RE.test(ctx.params.novelId || '')) throw new HttpError(404, 'Novel tidak ditemukan', 'not_found');
  await ctx.fs.commit([op.delete(`shelves/${ctx.auth.uid}_${ctx.params.novelId}`)]);
  return { ok: true };
}
