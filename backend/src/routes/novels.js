// Novel: daftar, detail, buat/ubah/hapus (admin), sampul.
// Sampul = JPEG kecil (maks 80 KB) di koleksi terpisah "covers/{novelId}", bukan di Firebase Storage (berbayar).
import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { isAdmin, requireAdmin } from '../lib/guard.js';
import { op } from '../lib/firestore.js';
import { novelOut, chapterOut, newId, ID_RE } from '../lib/models.js';

export const STATUSES = ['berlanjut', 'tamat', 'jeda'];
const COVER_MAX = 80000;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function loadNovel(ctx, id, { forWrite = false } = {}) {
  if (!ID_RE.test(id || '')) throw new HttpError(404, 'Novel tidak ditemukan', 'not_found');
  const n = await ctx.fs.get(`novels/${id}`);
  if (!n || (!n.published && !isAdmin(ctx.auth.user))) throw new HttpError(404, 'Novel tidak ditemukan', 'not_found');
  if (forWrite) requireAdmin(ctx);
  return n;
}

export async function list(ctx) {
  const all = await ctx.fs.list('novels');
  const admin = isAdmin(ctx.auth.user);
  const items = all.filter((n) => admin || n.published).sort((a, b) => String(b.lastChapterAt || b.updatedAt || '').localeCompare(String(a.lastChapterAt || a.updatedAt || '')));
  return { novels: items.map(novelOut) };
}

export async function detail(ctx) {
  const n = await loadNovel(ctx, ctx.params.id);
  const admin = isAdmin(ctx.auth.user);
  const chapters = (await ctx.fs.query('chapters', { where: [['novelId', '==', n.id]] }))
    .filter((c) => admin || c.published !== false)
    .sort((a, b) => a.no - b.no);
  const shelf = await ctx.fs.get(`shelves/${ctx.auth.uid}_${n.id}`);
  return {
    novel: novelOut(n),
    chapters: chapters.map(chapterOut),
    shelf: shelf ? { fav: !!shelf.fav, chapterId: shelf.chapterId || null, pos: shelf.pos || 0, updatedAt: shelf.updatedAt } : null,
  };
}

function fields(b, partial) {
  const out = {};
  const has = (k) => !partial || b[k] !== undefined;
  if (has('title')) out.title = v.str(b.title, { name: 'Judul', min: 2, max: 100 });
  if (has('author')) out.author = v.str(b.author, { name: 'Penulis', max: 60 });
  if (has('synopsis')) out.synopsis = v.str(b.synopsis, { name: 'Sinopsis', max: 2000, multiline: true });
  if (has('genres')) {
    if (!Array.isArray(b.genres) || b.genres.length > 5) throw new HttpError(400, 'Genre maksimal 5', 'validation');
    out.genres = [...new Set(b.genres.map((g) => v.str(g, { name: 'Genre', min: 1, max: 20 })))];
  }
  if (has('status')) out.status = v.oneOf(b.status, STATUSES, 'Status');
  if (b.published !== undefined) out.published = v.bool(b.published, 'Terbit');
  return out;
}

export async function create(ctx) {
  requireAdmin(ctx);
  const b = await ctx.json();
  const id = newId();
  const data = { ...fields({ author: ctx.auth.user.fullName, genres: [], status: 'berlanjut', synopsis: '', ...b }, false), published: b.published === true, chapterCount: 0, wordCount: 0, createdAt: ctx.now, updatedAt: ctx.now };
  await ctx.fs.commit([op.create(`novels/${id}`, data)]);
  return { novel: novelOut({ id, ...data }) };
}

export async function update(ctx) {
  const n = await loadNovel(ctx, ctx.params.id, { forWrite: true });
  const patch = { ...fields(await ctx.json(), true), updatedAt: ctx.now };
  await ctx.fs.commit([op.update(`novels/${n.id}`, patch)]);
  return { novel: novelOut({ ...n, ...patch }) };
}

async function deleteAll(ctx, ops) {
  for (let i = 0; i < ops.length; i += 400) await ctx.fs.commit(ops.slice(i, i + 400));
}

export async function remove(ctx) {
  const n = await loadNovel(ctx, ctx.params.id, { forWrite: true });
  const chapters = await ctx.fs.query('chapters', { where: [['novelId', '==', n.id]] });
  const shelves = await ctx.fs.query('shelves', { where: [['novelId', '==', n.id]] });
  const ops = [
    ...chapters.flatMap((c) => [op.delete(`chapters/${c.id}`), op.delete(`chaptertext/${c.id}`)]),
    ...shelves.map((s) => op.delete(`shelves/${s.id}`)),
    op.delete(`covers/${n.id}`),
    op.delete(`novels/${n.id}`),
  ];
  await deleteAll(ctx, ops);
  return { ok: true };
}

// ---------- sampul ----------
function jpegOk(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false;
  return bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}

export async function putCover(ctx) {
  const n = await loadNovel(ctx, ctx.params.id, { forWrite: true });
  const b = await ctx.json(130000);
  if (typeof b.image !== 'string' || !B64.test(b.image)) throw new HttpError(400, 'Sampul bukan gambar yang valid', 'cover_invalid');
  let bytes;
  try { bytes = Uint8Array.from(atob(b.image), (c) => c.charCodeAt(0)); } catch { throw new HttpError(400, 'Sampul bukan gambar yang valid', 'cover_invalid'); }
  if (bytes.length > COVER_MAX) throw new HttpError(413, `Sampul terlalu besar (maksimal ${COVER_MAX / 1000} KB setelah dikompres)`, 'cover_too_large');
  if (!jpegOk(bytes)) throw new HttpError(400, 'Sampul harus berupa gambar JPEG yang utuh', 'cover_type');
  const ver = ctx.now.getTime();
  await ctx.fs.commit([op.set(`covers/${n.id}`, { image: b.image, ver }), op.update(`novels/${n.id}`, { coverVer: ver, updatedAt: ctx.now })]);
  return { coverVer: ver };
}

export async function deleteCover(ctx) {
  const n = await loadNovel(ctx, ctx.params.id, { forWrite: true });
  await ctx.fs.commit([op.delete(`covers/${n.id}`), op.update(`novels/${n.id}`, { coverVer: null, updatedAt: ctx.now })]);
  return { ok: true };
}

export async function getCover(ctx) {
  const n = await loadNovel(ctx, ctx.params.id);
  const c = await ctx.fs.get(`covers/${n.id}`);
  if (!c) throw new HttpError(404, 'Sampul tidak ada', 'not_found');
  const bin = atob(c.image);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } });
}
