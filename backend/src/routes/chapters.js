// Bab novel. Metadata di "chapters/{id}", isi teks di "chaptertext/{id}" supaya daftar bab ringan dibaca.
import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { isAdmin, requireAdmin } from '../lib/guard.js';
import { op } from '../lib/firestore.js';
import { chapterOut, newId, ID_RE } from '../lib/models.js';
import { loadNovel } from './novels.js';

export const MAX_CHAPTER_CHARS = 120000;
const MAX_PER_REQUEST = 40;

const cleanText = (t, name = 'Isi bab') => {
  if (typeof t !== 'string') throw new HttpError(400, `${name} harus berupa teks`, 'validation');
  const s = t.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length < 1) throw new HttpError(400, `${name} tidak boleh kosong`, 'validation');
  if (s.length > MAX_CHAPTER_CHARS) throw new HttpError(413, `${name} terlalu panjang (maksimal ${MAX_CHAPTER_CHARS.toLocaleString('id')} huruf per bab). Pecah jadi dua bab.`, 'chapter_too_long');
  return s;
};
const countWords = (s) => (s.match(/\S+/g) || []).length;

/** Hitung ulang jumlah bab terbit, jumlah kata, dan waktu bab terakhir pada novel. */
async function recount(ctx, novelId, extra = {}) {
  const chapters = (await ctx.fs.query('chapters', { where: [['novelId', '==', novelId]] })).filter((c) => c.published !== false);
  const last = chapters.reduce((m, c) => (String(c.createdAt) > m ? String(c.createdAt) : m), '');
  await ctx.fs.commit([op.update(`novels/${novelId}`, { chapterCount: chapters.length, wordCount: chapters.reduce((s, c) => s + (c.words || 0), 0), lastChapterAt: last ? new Date(last) : null, updatedAt: ctx.now, ...extra })]);
}

/** Admin menambah banyak bab sekaligus (hasil impor Word/PDF). Selalu ditambahkan di akhir. */
export async function addMany(ctx) {
  const n = await loadNovel(ctx, ctx.params.id, { forWrite: true });
  const b = await ctx.json(1000000);
  if (!Array.isArray(b.chapters) || !b.chapters.length) throw new HttpError(400, 'Belum ada bab yang dikirim', 'validation');
  if (b.chapters.length > MAX_PER_REQUEST) throw new HttpError(400, `Maksimal ${MAX_PER_REQUEST} bab sekali kirim`, 'validation');
  const published = b.published !== false;
  const existing = await ctx.fs.query('chapters', { where: [['novelId', '==', n.id]] });
  let no = existing.reduce((m, c) => Math.max(m, c.no || 0), 0);
  const ops = [];
  const out = [];
  for (const [i, c] of b.chapters.entries()) {
    const title = v.str(c.title, { name: `Judul bab ${i + 1}`, min: 1, max: 120 });
    const text = cleanText(c.text, `Isi bab ${i + 1}`);
    const id = newId();
    const meta = { novelId: n.id, no: ++no, title, words: countWords(text), published, createdAt: new Date(ctx.now.getTime() + i) };
    ops.push(op.create(`chapters/${id}`, meta), op.create(`chaptertext/${id}`, { novelId: n.id, text }));
    out.push(chapterOut({ id, ...meta }));
  }
  await ctx.fs.commit(ops);
  await recount(ctx, n.id);
  return { chapters: out };
}

export async function removeAll(ctx) {
  const n = await loadNovel(ctx, ctx.params.id, { forWrite: true });
  const chapters = await ctx.fs.query('chapters', { where: [['novelId', '==', n.id]] });
  const ops = chapters.flatMap((c) => [op.delete(`chapters/${c.id}`), op.delete(`chaptertext/${c.id}`)]);
  for (let i = 0; i < ops.length; i += 400) await ctx.fs.commit(ops.slice(i, i + 400));
  await recount(ctx, n.id);
  return { ok: true, removed: chapters.length };
}

async function loadChapter(ctx, { forWrite = false } = {}) {
  const n = await loadNovel(ctx, ctx.params.id, { forWrite });
  if (!ID_RE.test(ctx.params.cid || '')) throw new HttpError(404, 'Bab tidak ditemukan', 'not_found');
  const c = await ctx.fs.get(`chapters/${ctx.params.cid}`);
  if (!c || c.novelId !== n.id || (c.published === false && !isAdmin(ctx.auth.user))) throw new HttpError(404, 'Bab tidak ditemukan', 'not_found');
  return { n, c };
}

export async function get(ctx) {
  const { n, c } = await loadChapter(ctx);
  const admin = isAdmin(ctx.auth.user);
  const [t, all, shelf] = await Promise.all([ctx.fs.get(`chaptertext/${c.id}`), ctx.fs.query('chapters', { where: [['novelId', '==', n.id]] }), ctx.fs.get(`shelves/${ctx.auth.uid}_${n.id}`)]);
  const list = all.filter((x) => admin || x.published !== false).sort((a, b) => a.no - b.no);
  const i = list.findIndex((x) => x.id === c.id);
  const ref = (x) => (x ? { id: x.id, no: x.no, title: x.title } : null);
  return { novel: { id: n.id, title: n.title }, chapter: { ...chapterOut(c), text: t?.text || '' }, prev: ref(list[i - 1]), next: ref(list[i + 1]), index: i + 1, total: list.length, saved: shelf?.chapterId === c.id ? { pos: shelf.pos || 0 } : null };
}

export async function update(ctx) {
  const { n, c } = await loadChapter(ctx, { forWrite: true });
  const b = await ctx.json(300000);
  const meta = {};
  const ops = [];
  if (b.title !== undefined) meta.title = v.str(b.title, { name: 'Judul bab', min: 1, max: 120 });
  if (b.published !== undefined) meta.published = v.bool(b.published, 'Terbit');
  if (b.text !== undefined) {
    const text = cleanText(b.text);
    meta.words = countWords(text);
    ops.push(op.set(`chaptertext/${c.id}`, { novelId: n.id, text }));
  }
  if (Object.keys(meta).length) ops.push(op.update(`chapters/${c.id}`, meta));
  if (!ops.length) throw new HttpError(400, 'Tidak ada yang diubah', 'validation');
  await ctx.fs.commit(ops);
  await recount(ctx, n.id);
  return { chapter: chapterOut({ ...c, ...meta }) };
}

export async function remove(ctx) {
  const { n, c } = await loadChapter(ctx, { forWrite: true });
  await ctx.fs.commit([op.delete(`chapters/${c.id}`), op.delete(`chaptertext/${c.id}`)]);
  await recount(ctx, n.id);
  return { ok: true };
}
