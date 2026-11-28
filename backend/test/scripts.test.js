import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createFake } from './fake-google.js';
import { resetRateLimits } from '../src/lib/ratelimit.js';
import { buatAdmin } from '../../scripts/buat-admin.mjs';

let fake;
beforeEach(async () => { mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-26T03:00:00Z') }); fake = await createFake(); fake.install(); resetRateLimits(); });
afterEach(() => { fake.uninstall(); mock.timers.reset(); });
const login = async (username, password) => (await worker.fetch(new Request('https://z.test/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) }), fake.env));

test('buat admin: akun bisa masuk sebagai admin; diulang = reset password; tidak mengambil alih username pembaca', async () => {
  const r = await buatAdmin(fake.env, { username: 'zeii', fullName: 'Zeii', password: 'Rahasia123' });
  assert.equal(r.reset, false);
  const l = await login('zeii', 'Rahasia123'); assert.equal(l.status, 200); assert.equal((await l.json()).user.role, 'admin');
  const again = await buatAdmin(fake.env, { username: 'zeii', fullName: 'Zeii Baru', password: 'Baru12345' });
  assert.equal(again.reset, true);
  assert.equal((await login('zeii', 'Rahasia123')).status, 401);
  assert.equal((await login('zeii', 'Baru12345')).status, 200);
  fake.seedUser({ uid: 'uidRead0001', username: 'ani', fullName: 'Ani', role: 'reader' });
  await assert.rejects(() => buatAdmin(fake.env, { username: 'ani', fullName: 'Ani', password: 'Rahasia123' }), /pembaca biasa/);
  assert.equal(fake.getDoc('users/uidRead0001').role, 'reader');
  await assert.rejects(() => buatAdmin(fake.env, { username: 'x', fullName: 'A', password: 'pendek' }));
});

test('buat admin: sisa akun Auth tanpa profil (percobaan gagal sebelumnya) diperbaiki, bukan error', async () => {
  const { createAuthUser } = await import('../src/lib/google.js');
  await createAuthUser(fake.env, { username: 'zeii', password: 'Lama12345', displayName: 'Zeii' }); // yatim: tidak ada dokumen Firestore
  assert.equal((await login('zeii', 'Lama12345')).status, 403); // gejala: "Akun belum terdaftar"
  const r = await buatAdmin(fake.env, { username: 'zeii', fullName: 'Zeii', password: 'Baru12345' });
  assert.equal(r.reset, false);
  const l = await login('zeii', 'Baru12345'); assert.equal(l.status, 200); assert.equal((await l.json()).user.role, 'admin');
  assert.equal(fake.countDocs('users'), 1);
});

test('impor: 25 bab terdeteksi dalam berbagai gaya penulisan judul, nomor hilang dilaporkan', async () => {
  const { splitChapters } = await import('../../public/js/import.js');
  const body = 'Ini isi bab yang cukup panjang untuk dihitung sebagai kata kata kata kata.';
  const build = (fmt, skip = []) => { const ps = []; for (let i = 1; i <= 25; i++) { if (skip.includes(i)) continue; for (const t of fmt(i)) ps.push({ text: t }); ps.push({ text: body }, { text: body }); } return ps; };
  for (const fmt of [(i) => [`Bab ${i}`], (i) => [`BAB ${i} - Judul`], (i) => [`Chapter ${String(i).padStart(2, '0')}`], (i) => [`${i}. Judul ${i}`], (i) => [`${i}`], (i) => [`Bab ${i}`, `Judul ${i}`]]) {
    const r = splitChapters(build(fmt));
    assert.equal(r.chapters.length, 25);
    assert.match(r.notes[0], /25 bab \(nomor 1 sampai 25\)/);
  }
  const gap = splitChapters(build((i) => [`Bab ${i}`], [7, 12]));
  assert.equal(gap.chapters.length, 23);
  assert.ok(gap.notes.some((n) => /tidak ditemukan: 7, 12/.test(n)));
});

test('impor PDF: nomor halaman, kepala halaman, daftar isi dibuang; judul dua baris digabung; paragraf dari lekuk baris', async () => {
  const { pdfPagesToParas, splitChapters } = await import('../../public/js/import.js');
  const R = (x, y, text) => ({ x, y: -y, text });
  const line = 'Kalimat isi yang cukup panjang untuk dianggap baris badan biasa.';
  const pages = [
    { rows: [R(180, 20, 'DAFTAR ISI'), R(50, 60, 'Bab 1 Awal yang Baru . . . . . . . . 5'), R(50, 80, 'Bab 2 Dua Baris Judul . . . . . . . 9')] },
    { rows: [R(200, 100, 'BAB 1'), R(120, 140, 'AWAL YANG BARU'), R(70, 200, `SIANG ITU mulai. ${line}`), R(50, 218, line), R(70, 236, `Paragraf kedua. ${line}`), R(50, 254, line), R(200, 700, '5')] },
    { rows: [R(180, 18, 'Awal yang Baru'), R(50, 50, 'lanjutan kalimat sebelumnya tanpa lekuk.'), R(70, 68, `Paragraf ketiga. ${line}`), R(50, 86, line), R(200, 700, '6')] },
    { rows: [R(200, 100, 'BAB 2'), R(130, 140, 'DUA BARIS'), R(120, 158, 'JUDUL'), R(70, 220, `Isi bab dua. ${line}`), R(50, 238, line), R(200, 700, '9')] },
    { rows: [R(180, 18, 'Awal yang Baru'), R(70, 50, `Lanjut. ${line}`), R(50, 68, line)] },
    { rows: [R(180, 18, 'Awal yang Baru'), R(70, 50, `Lagi. ${line}`), R(50, 68, line)] },
    { rows: [R(180, 18, 'Awal yang Baru'), R(70, 50, `Terakhir. ${line}`), R(50, 68, line)] },
  ];
  const r = splitChapters(pdfPagesToParas(pages));
  assert.deepEqual(r.chapters.map((c) => c.title), ['Bab 1: Awal yang Baru', 'Bab 2: Dua Baris Judul']);
  const t = r.chapters[0].text;
  assert.equal(t.split('\n\n').length, 3, 'tiga paragraf (dua di halaman pertama, satu di halaman berikut)');
  assert.ok(t.includes('baris badan biasa. lanjutan kalimat sebelumnya'), 'kalimat bersambung antarhalaman');
  assert.ok(!/Awal yang Baru|\n\n[56]\n\n/.test(t), 'kepala dan nomor halaman hilang');
});
