// Pengujian otomatis API Zeii Ebook melawan Firebase tiruan. Jalankan: cd backend && node --test test/
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createFake } from './fake-google.js';
import { resetRateLimits } from '../src/lib/ratelimit.js';

let fake;
let env;

async function api(method, path, { token, body, raw } = {}) {
  const res = await worker.fetch(new Request('https://zeii.test' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  if (raw) return res;
  return { status: res.status, data: await res.json() };
}
async function login(username, password = 'Passw0rd!') {
  const r = await api('POST', '/api/auth/login', { body: { username, password } });
  assert.equal(r.status, 200, `login ${username}: ${JSON.stringify(r.data)}`);
  return r.data.idToken;
}
const ch = (n, extra = '') => ({ title: `Bab ${n}`, text: `Isi bab ${n}.\n\nParagraf kedua ${extra}` });

beforeEach(async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-26T03:00:00Z') });
  fake = await createFake();
  env = fake.env;
  fake.install();
  resetRateLimits();
  fake.seedUser({ uid: 'uidAdmin001', username: 'zeii', fullName: 'Zeii', role: 'admin' });
  fake.seedUser({ uid: 'uidRead0001', username: 'ani', fullName: 'Ani', role: 'reader' });
  fake.seedUser({ uid: 'uidRead0002', username: 'budi', fullName: 'Budi', role: 'reader' });
});
afterEach(() => { fake.uninstall(); mock.timers.reset(); });

async function makeNovel(admin, over = {}) {
  const r = await api('POST', '/api/novels', { token: admin, body: { title: 'Langit Senja', synopsis: 'Kisah di ujung hari.', genres: ['Romansa', 'Drama'], published: true, ...over } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.novel;
}

describe('Akun', () => {
  test('daftar sebagai pembaca, otomatis masuk, username kembar ditolak, validasi', async () => {
    const r = await api('POST', '/api/auth/register', { body: { username: 'sinta', fullName: 'Sinta Dewi', password: 'rahasia123' } });
    assert.equal(r.status, 200); assert.equal(r.data.user.role, 'reader'); assert.ok(r.data.idToken);
    assert.equal((await api('GET', '/api/me', { token: r.data.idToken })).data.user.username, 'sinta');
    assert.equal((await login('sinta', 'rahasia123')).length > 10, true);
    assert.equal((await api('POST', '/api/auth/register', { body: { username: 'sinta', fullName: 'Lain', password: 'rahasia123' } })).data.error.code, 'username_taken');
    assert.equal((await api('POST', '/api/auth/register', { body: { username: 'X', fullName: 'Lain', password: 'rahasia123' } })).status, 400);
    assert.equal((await api('POST', '/api/auth/register', { body: { username: 'tono', fullName: 'Tono', password: 'pendek' } })).status, 400);
    assert.equal((await api('POST', '/api/auth/register', { body: { username: 'tono', fullName: 'Tono', password: 'rahasia123', role: 'admin' } })).data.user.role, 'reader'); // role tidak bisa dipaksa
    env.REGISTRATION = 'closed';
    assert.equal((await api('POST', '/api/auth/register', { body: { username: 'baru1', fullName: 'Baru', password: 'rahasia123' } })).data.error.code, 'registration_closed');
  });

  test('wajib login; akun nonaktif ditolak; ganti password; ganti nama', async () => {
    assert.equal((await api('GET', '/api/novels')).status, 401);
    const t = await login('ani');
    assert.equal((await api('PATCH', '/api/me', { token: t, body: { fullName: 'Ani Baru' } })).data.user.fullName, 'Ani Baru');
    assert.equal((await api('POST', '/api/me/password', { token: t, body: { currentPassword: 'salah', newPassword: 'Baru12345' } })).status, 401);
    assert.equal((await api('POST', '/api/me/password', { token: t, body: { currentPassword: 'Passw0rd!', newPassword: 'Baru12345' } })).status, 200);
    await login('ani', 'Baru12345');
  });

  test('admin: lihat pembaca, nonaktifkan, reset password; pembaca tidak boleh', async () => {
    const admin = await login('zeii'); const ani = await login('ani');
    assert.equal((await api('GET', '/api/users', { token: ani })).status, 403);
    assert.equal((await api('GET', '/api/users', { token: admin })).data.users.length, 3);
    assert.equal((await api('POST', '/api/users/uidRead0002/password', { token: admin, body: { newPassword: 'Baru12345' } })).status, 200);
    await login('budi', 'Baru12345');
    assert.equal((await api('POST', '/api/users/uidRead0002/active', { token: admin, body: { active: false } })).status, 200);
    assert.equal((await api('POST', '/api/auth/login', { body: { username: 'budi', password: 'Baru12345' } })).status, 403);
    assert.equal((await api('POST', '/api/users/uidAdmin001/active', { token: admin, body: { active: false } })).status, 403);
  });
});

describe('Novel dan bab', () => {
  test('hanya admin membuat; draf tersembunyi dari pembaca; terbit membuka', async () => {
    const admin = await login('zeii'); const ani = await login('ani');
    assert.equal((await api('POST', '/api/novels', { token: ani, body: { title: 'Curang' } })).status, 403);
    const draft = await makeNovel(admin, { title: 'Masih Draf', published: false });
    assert.equal((await api('GET', '/api/novels', { token: ani })).data.novels.length, 0);
    assert.equal((await api('GET', '/api/novels', { token: admin })).data.novels.length, 1);
    assert.equal((await api('GET', `/api/novels/${draft.id}`, { token: ani })).status, 404);
    await api('PATCH', `/api/novels/${draft.id}`, { token: admin, body: { published: true, status: 'tamat' } });
    const l = (await api('GET', '/api/novels', { token: ani })).data.novels;
    assert.equal(l.length, 1); assert.equal(l[0].status, 'tamat');
    assert.equal((await api('PATCH', `/api/novels/${draft.id}`, { token: admin, body: { status: 'ngawur' } })).status, 400);
    assert.equal((await api('PATCH', `/api/novels/${draft.id}`, { token: ani, body: { title: 'Retas' } })).status, 403);
  });

  test('tambah banyak bab: urutan, jumlah kata, bab draf tersembunyi, daftar/isi/sebelum-sesudah', async () => {
    const admin = await login('zeii'); const ani = await login('ani');
    const n = await makeNovel(admin);
    const r = await api('POST', `/api/novels/${n.id}/chapters`, { token: admin, body: { chapters: [ch(1), ch(2), ch(3)] } });
    assert.equal(r.status, 200); assert.deepEqual(r.data.chapters.map((c) => c.no), [1, 2, 3]);
    const r2 = await api('POST', `/api/novels/${n.id}/chapters`, { token: admin, body: { chapters: [ch(4)], published: false } });
    assert.equal(r2.data.chapters[0].no, 4); assert.equal(r2.data.chapters[0].published, false);
    const d = (await api('GET', `/api/novels/${n.id}`, { token: ani })).data;
    assert.deepEqual(d.chapters.map((c) => c.no), [1, 2, 3]); assert.equal(d.novel.chapterCount, 3); assert.ok(d.novel.wordCount >= 9);
    assert.equal((await api('GET', `/api/novels/${n.id}`, { token: admin })).data.chapters.length, 4);
    const mid = (await api('GET', `/api/novels/${n.id}/chapters/${d.chapters[1].id}`, { token: ani })).data;
    assert.match(mid.chapter.text, /Isi bab 2/); assert.equal(mid.prev.no, 1); assert.equal(mid.next.no, 3); assert.equal(mid.index, 2); assert.equal(mid.total, 3);
    assert.equal((await api('GET', `/api/novels/${n.id}/chapters/${r2.data.chapters[0].id}`, { token: ani })).status, 404); // draf
    assert.equal((await api('GET', `/api/novels/${n.id}/chapters/${r2.data.chapters[0].id}`, { token: admin })).status, 200);
    assert.equal((await api('POST', `/api/novels/${n.id}/chapters`, { token: ani, body: { chapters: [ch(9)] } })).status, 403);
  });

  test('validasi bab: kosong, terlalu panjang, terlalu banyak sekaligus, karakter kontrol dibuang', async () => {
    const admin = await login('zeii'); const n = await makeNovel(admin);
    const post = (chapters) => api('POST', `/api/novels/${n.id}/chapters`, { token: admin, body: { chapters } });
    assert.equal((await post([])).status, 400);
    assert.equal((await post([{ title: 'a', text: '   ' }])).status, 400);
    assert.equal((await post([{ title: '', text: 'x' }])).status, 400);
    assert.equal((await post([{ title: 'Panjang', text: 'a '.repeat(70000) }])).data.error.code, 'chapter_too_long');
    assert.equal((await post(Array.from({ length: 41 }, (_, i) => ch(i)))).status, 400);
    const ok = await post([{ title: 'Bersih', text: 'Halo\u0000\u0007 dunia\r\n\r\n\r\n\r\nBaris' }]);
    const t = (await api('GET', `/api/novels/${n.id}/chapters/${ok.data.chapters[0].id}`, { token: admin })).data.chapter.text;
    assert.equal(t, 'Halo dunia\n\nBaris');
  });

  test('ubah bab, hapus bab, hapus semua bab memperbarui hitungan', async () => {
    const admin = await login('zeii'); const ani = await login('ani'); const n = await makeNovel(admin);
    const a = (await api('POST', `/api/novels/${n.id}/chapters`, { token: admin, body: { chapters: [ch(1), ch(2), ch(3)] } })).data.chapters;
    assert.equal((await api('PATCH', `/api/novels/${n.id}/chapters/${a[0].id}`, { token: admin, body: { title: 'Prolog', text: 'Teks baru yang lebih panjang dari sebelumnya.' } })).status, 200);
    assert.equal((await api('GET', `/api/novels/${n.id}/chapters/${a[0].id}`, { token: ani })).data.chapter.title, 'Prolog');
    assert.equal((await api('PATCH', `/api/novels/${n.id}/chapters/${a[1].id}`, { token: admin, body: { published: false } })).status, 200);
    assert.equal((await api('GET', `/api/novels/${n.id}`, { token: ani })).data.novel.chapterCount, 2);
    assert.equal((await api('DELETE', `/api/novels/${n.id}/chapters/${a[2].id}`, { token: admin })).status, 200);
    assert.equal((await api('GET', `/api/novels/${n.id}`, { token: ani })).data.novel.chapterCount, 1);
    assert.equal(fake.countDocs('chaptertext'), 2);
    assert.equal((await api('DELETE', `/api/novels/${n.id}/chapters`, { token: admin })).data.removed, 2);
    assert.equal(fake.countDocs('chapters'), 0); assert.equal(fake.countDocs('chaptertext'), 0);
    assert.equal((await api('GET', `/api/novels/${n.id}`, { token: ani })).data.novel.chapterCount, 0);
  });

  test('bab milik novel lain tidak bisa dibuka lewat novel ini', async () => {
    const admin = await login('zeii'); const ani = await login('ani');
    const n1 = await makeNovel(admin); const n2 = await makeNovel(admin, { title: 'Novel Dua' });
    const c = (await api('POST', `/api/novels/${n1.id}/chapters`, { token: admin, body: { chapters: [ch(1)] } })).data.chapters[0];
    assert.equal((await api('GET', `/api/novels/${n2.id}/chapters/${c.id}`, { token: ani })).status, 404);
    assert.equal((await api('GET', '/api/novels/../chapters/x', { token: ani })).status, 404);
  });

  test('hapus novel membersihkan bab, sampul, dan rak pembaca', async () => {
    const admin = await login('zeii'); const ani = await login('ani'); const n = await makeNovel(admin);
    const c = (await api('POST', `/api/novels/${n.id}/chapters`, { token: admin, body: { chapters: [ch(1), ch(2)] } })).data.chapters;
    await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { fav: true, chapterId: c[0].id } });
    assert.equal((await api('DELETE', `/api/novels/${n.id}`, { token: ani })).status, 403);
    assert.equal((await api('DELETE', `/api/novels/${n.id}`, { token: admin })).status, 200);
    for (const col of ['novels', 'chapters', 'chaptertext', 'shelves', 'covers']) assert.equal(fake.countDocs(col), 0, col);
  });
});

describe('Sampul', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 1), Buffer.from([0xff, 0xd9])]).toString('base64');
  test('unggah, ambil, ganti, hapus; bukan JPEG dan terlalu besar ditolak; hanya admin', async () => {
    const admin = await login('zeii'); const ani = await login('ani'); const n = await makeNovel(admin);
    assert.equal((await api('PUT', `/api/novels/${n.id}/cover`, { token: ani, body: { image: jpeg } })).status, 403);
    assert.equal((await api('PUT', `/api/novels/${n.id}/cover`, { token: admin, body: { image: Buffer.from('bukan gambar').toString('base64') } })).data.error.code, 'cover_type');
    assert.equal((await api('PUT', `/api/novels/${n.id}/cover`, { token: admin, body: { image: '<script>' } })).data.error.code, 'cover_invalid');
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(90000, 1), Buffer.from([0xff, 0xd9])]).toString('base64');
    assert.equal((await api('PUT', `/api/novels/${n.id}/cover`, { token: admin, body: { image: big } })).status, 413);
    const ok = await api('PUT', `/api/novels/${n.id}/cover`, { token: admin, body: { image: jpeg } });
    assert.equal(ok.status, 200); assert.ok(ok.data.coverVer);
    assert.equal((await api('GET', '/api/novels', { token: ani })).data.novels[0].coverVer, ok.data.coverVer);
    const img = await api('GET', `/api/novels/${n.id}/cover`, { token: ani, raw: true });
    assert.equal(img.headers.get('content-type'), 'image/jpeg'); assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), jpeg);
    assert.equal((await api('DELETE', `/api/novels/${n.id}/cover`, { token: admin })).status, 200);
    assert.equal((await api('GET', `/api/novels/${n.id}/cover`, { token: ani })).status, 404);
  });
});

describe('Rak dan progres baca', () => {
  test('favorit, simpan bab + posisi, lanjut baca, rak hanya milik sendiri, hapus dari rak', async () => {
    const admin = await login('zeii'); const ani = await login('ani'); const budi = await login('budi');
    const n = await makeNovel(admin);
    const c = (await api('POST', `/api/novels/${n.id}/chapters`, { token: admin, body: { chapters: [ch(1), ch(2)] } })).data.chapters;
    assert.equal((await api('GET', `/api/novels/${n.id}`, { token: ani })).data.shelf, null);
    assert.equal((await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { fav: true } })).status, 200);
    assert.equal((await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { chapterId: c[1].id, pos: 0.4567 } })).status, 200);
    const d = (await api('GET', `/api/novels/${n.id}`, { token: ani })).data.shelf;
    assert.equal(d.fav, true); assert.equal(d.chapterId, c[1].id); assert.equal(d.pos, 0.457);
    // posisi saja tidak mengubah favorit; pindah bab mengatur ulang posisi
    await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { pos: 0.9 } });
    assert.equal((await api('GET', `/api/novels/${n.id}`, { token: ani })).data.shelf.fav, true);
    await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { chapterId: c[0].id } });
    assert.equal((await api('GET', `/api/novels/${n.id}`, { token: ani })).data.shelf.pos, 0);
    assert.equal((await api('GET', `/api/novels/${n.id}/chapters/${c[0].id}`, { token: ani })).data.saved.pos, 0);
    await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { pos: 0.6 } });
    assert.equal((await api('GET', `/api/novels/${n.id}/chapters/${c[0].id}`, { token: ani })).data.saved.pos, 0.6);
    assert.equal((await api('GET', `/api/novels/${n.id}/chapters/${c[1].id}`, { token: ani })).data.saved, null);
    await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { pos: 0 } });
    const rak = (await api('GET', '/api/shelf', { token: ani })).data.items;
    assert.equal(rak.length, 1); assert.equal(rak[0].chapterTitle, 'Bab 1'); assert.equal(rak[0].novel.title, 'Langit Senja');
    assert.equal((await api('GET', '/api/shelf', { token: budi })).data.items.length, 0);
    assert.equal((await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { pos: 2 } })).status, 400);
    assert.equal((await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { chapterId: 'tidakadabab12' } })).status, 404);
    assert.equal((await api('DELETE', `/api/shelf/${n.id}`, { token: ani })).status, 200);
    assert.equal((await api('GET', '/api/shelf', { token: ani })).data.items.length, 0);
  });

  test('novel yang ditarik dari terbitan hilang dari rak; novel draf tidak bisa dimasukkan; batas laju', async () => {
    const admin = await login('zeii'); const ani = await login('ani');
    const n = await makeNovel(admin); const draft = await makeNovel(admin, { title: 'Draf', published: false });
    assert.equal((await api('PUT', `/api/shelf/${draft.id}`, { token: ani, body: { fav: true } })).status, 404);
    await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { fav: true } });
    await api('PATCH', `/api/novels/${n.id}`, { token: admin, body: { published: false } });
    assert.equal((await api('GET', '/api/shelf', { token: ani })).data.items.length, 0);
    await api('PATCH', `/api/novels/${n.id}`, { token: admin, body: { published: true } });
    let last;
    for (let i = 0; i < 62; i++) last = await api('PUT', `/api/shelf/${n.id}`, { token: ani, body: { pos: 0.5 } });
    assert.equal(last.status, 429);
  });
});
