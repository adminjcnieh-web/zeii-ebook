// Pengujian end-to-end di browser sungguhan (Chromium + Playwright): frontend asli + Worker asli + Firebase TIRUAN.
// Jalankan: node backend/test/e2e/e2e.mjs
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startServer } from './dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SHOTS_DIR || path.join(os.tmpdir(), 'zeii-shots');
const FX = path.join(os.tmpdir(), 'zeii-fx');
fs.mkdirSync(SHOTS, { recursive: true });
execFileSync('python3', ['-I', path.join(here, 'make-fixtures.py'), FX]);

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  PASS  ${name} (${Date.now() - t} ms)`); }
  catch (e) { results.push({ name, ok: false }); console.log(`  FAIL  ${name}\n        ${String(e.stack || e).split('\n').slice(0, 5).join('\n        ')}`); }
}

const srv = await startServer({ port: 8790 });
const { fake } = srv;
fake.seedUser({ uid: 'uidAdmin001', username: 'zeii', fullName: 'Zeii', role: 'admin' });
fake.seedUser({ uid: 'uidRead0001', username: 'ani', fullName: 'Ani Pembaca', role: 'reader' });

const browser = await chromium.launch();
const pageErrors = [];
async function newPage({ width = 1100, height = 800, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, acceptDownloads: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) pageErrors.push(m.text()); });
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
async function signIn(page, username, password = 'Passw0rd!') {
  await page.goto(srv.url + '/');
  await page.fill('#a-user', username); await page.fill('#a-pw', password);
  await page.click('#a-go');
  await page.waitForSelector('.topbar');
}
const scrollTo = (page, f) => page.evaluate((f) => window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), f);

const admin = await newPage();
const reader = await newPage({ width: 390, height: 800, mobile: true });
let novelId; let firstChapterHref;

await step('Pembaca baru mendaftar, otomatis masuk, beranda kosong', async () => {
  const p = await newPage({ width: 390, height: 800, mobile: true });
  await p.goto(srv.url + '/');
  await p.click('#a-sw');
  await p.fill('#a-name', 'Sinta Dewi'); await p.fill('#a-user', 'sinta'); await p.fill('#a-pw', 'rahasia123');
  await p.click('#a-go');
  await p.waitForSelector('.topbar');
  assert.match(await p.innerText('h1'), /Halo, Sinta/);
  assert.match(await p.innerText('.empty'), /masih kosong/);
  assert.equal(await p.locator('a[href="#/kelola"]').count(), 0, 'pembaca tidak boleh melihat menu Kelola');
  await shot(p, '01-daftar-kosong');
  await p.goto(srv.url + '/#/kelola'); await p.waitForSelector('h1');
  assert.ok(!(await p.url()).includes('kelola'), 'rute admin harus dialihkan');
});

await step('Salah password menampilkan pesan jelas', async () => {
  const p = await newPage();
  await p.goto(srv.url + '/');
  await p.fill('#a-user', 'ani'); await p.fill('#a-pw', 'salahsalah1'); await p.click('#a-go');
  await p.waitForSelector('#af-err .form-error');
});

await step('Admin: buat novel baru', async () => {
  await signIn(admin, 'zeii');
  await admin.click('a[href="#/kelola"] >> nth=0');
  await admin.click('#new');
  await admin.fill('#n-title', 'Langit Senja');
  await admin.fill('#n-syn', 'Kisah dua orang asing yang bertemu di stasiun kecil pada senja yang basah.');
  await admin.fill('#n-genre', 'Romansa, Drama');
  await admin.check('#n-pub');
  await admin.click('.modal-foot .btn-primary');
  await admin.waitForSelector('text=Info novel');
  novelId = admin.url().split('/kelola/')[1];
  assert.ok(novelId);
});

await step('Admin: impor .docx, pratinjau mengenali 4 bab, simpan', async () => {
  await admin.click('#imp');
  await admin.setInputFiles('#f', path.join(FX, 'naskah.docx'));
  await admin.waitForSelector('.prev-list');
  const titles = await admin.$$eval('[data-t]', (els) => els.map((e) => e.value));
  assert.deepEqual(titles.filter((t) => /^Bab/.test(t)), ['Bab 1: Awal Mula', 'Bab 2: Pertemuan di Stasiun', 'Bab 3: Hujan Pertama', 'Bab 4: Pulang']);
  assert.match(await admin.innerText('.modal-body'), /Pembuka/, 'judul dokumen jadi "Pembuka" (tidak dicentang)');
  assert.equal(await admin.locator('[data-on="0"]').isChecked(), false);
  await shot(admin, '02-pratinjau-impor');
  await admin.fill('[data-t="1"]', 'Bab 1: Awal Mula (revisi)');
  await admin.click('#go');
  await admin.waitForSelector('.toast');
  await admin.waitForFunction(() => document.body.innerText.includes('Bab (4)'));
});

await step('Admin: impor .txt menambah bab berikutnya (nomor lanjut), unggah sampul', async () => {
  await admin.click('#imp');
  await admin.setInputFiles('#f', path.join(FX, 'cerita.txt'));
  await admin.waitForSelector('.prev-list');
  await admin.click('#go');
  await admin.waitForFunction(() => document.body.innerText.includes('Bab (7)'));
  await admin.setInputFiles('#cv', path.join(FX, 'sampul.png'));
  await admin.waitForFunction(() => document.querySelector('.panel .cover img'));
  await shot(admin, '03-kelola-novel');
});

await step('Admin: ubah bab, sembunyikan bab (draf), hapus bab', async () => {
  await admin.click('[data-edit] >> nth=6');
  await admin.fill('#c-t', 'Epilog Baru');
  await admin.click('.modal-foot .btn-primary');
  await admin.waitForSelector('text=Epilog Baru');
  await admin.click('[data-pub] >> nth=5');
  await admin.waitForSelector('text=Draf');
  await admin.click('[data-rm] >> nth=6');
  await admin.click('.modal-foot .btn-danger');
  await admin.waitForFunction(() => document.body.innerText.includes('Bab (6)'));
});

await step('Pembaca: lihat novel di beranda, detail, mulai membaca', async () => {
  await signIn(reader, 'ani');
  await reader.waitForSelector('.card');
  assert.match(await reader.innerText('.card h3'), /Langit Senja/);
  await reader.waitForFunction(() => document.querySelector('.card .cover img'), null, { timeout: 8000 });
  await shot(reader, '04-beranda');
  await reader.click('.card');
  await reader.waitForSelector('.novel-head');
  const items = await reader.$$eval('.chapters .t', (e) => e.map((x) => x.innerText.trim()));
  assert.ok(items.length >= 5 && !items.some((t) => /Draf/.test(t)), 'bab draf tidak terlihat oleh pembaca');
  await shot(reader, '05-detail-novel');
  await reader.click('text=Mulai membaca');
  await reader.waitForSelector('.rbody h1');
  assert.match(await reader.innerText('.rbody h1'), /Awal Mula/);
  firstChapterHref = reader.url();
  const html = await reader.innerHTML('.rbody');
  assert.ok(html.includes('&amp; tanda') && html.includes('&lt;aman&gt;'), 'karakter khusus di-escape');
  assert.ok(html.includes('class="brk"'), 'pemisah adegan ***');
  await shot(reader, '06-pembaca');
});

await step('Pembaca: pengaturan tampilan (tema, ukuran) tersimpan', async () => {
  await reader.click('#r-set');
  await reader.click('[data-seg="rt"] [data-v="sepia"]');
  await reader.fill('#s-fs', '24');
  await reader.click('[data-seg="wd"] [data-v="30"]');
  await reader.waitForTimeout(100);
  assert.equal(await reader.getAttribute('#reader', 'data-rt'), 'sepia');
  assert.equal(await reader.evaluate(() => getComputedStyle(document.querySelector('.rbody')).fontSize), '24px');
  await shot(reader, '07-pengaturan-baca');
  await reader.click('.modal [data-close]');
  await reader.reload(); await reader.waitForSelector('.rbody');
  assert.equal(await reader.getAttribute('#reader', 'data-rt'), 'sepia', 'pilihan tema bertahan setelah muat ulang');
});

await step('Pembaca: posisi gulir tersimpan, dipulihkan, kartu "Lanjutkan membaca"', async () => {
  await scrollTo(reader, 0.5);
  await reader.waitForTimeout(300);
  await reader.evaluate(() => window.scrollBy(0, -30)); // gulir ke atas memunculkan bilah
  await reader.waitForFunction(() => !document.querySelector('#reader').classList.contains('hide'));
  // simpan saat meninggalkan halaman
  await reader.click('a[aria-label="Kembali ke novel"]');
  await reader.waitForSelector('.novel-head');
  await reader.waitForTimeout(400);
  const saved = fake.getDoc('shelves/uidRead0001_' + novelId);
  assert.ok(saved && saved.pos > 0.35 && saved.pos < 0.65, 'posisi tersimpan: ' + JSON.stringify(saved));
  assert.match(await reader.innerText('.actions .btn-primary'), /Lanjut Bab 1/);
  await reader.click('.actions .btn-primary');
  await reader.waitForSelector('.rbody');
  await reader.waitForTimeout(400);
  const y = await reader.evaluate(() => scrollY / (document.documentElement.scrollHeight - innerHeight));
  assert.ok(Math.abs(y - saved.pos) < 0.05, `posisi dipulihkan ${y} vs ${saved.pos}`);
  await reader.goto(srv.url + '/#/'); await reader.waitForSelector('.resume');
  assert.match(await reader.innerText('.resume'), /Bab 1/);
  await shot(reader, '08-beranda-lanjut');
});

await step('Pembaca: bab berikutnya, daftar bab, favorit, rak', async () => {
  await reader.click('.resume');
  await reader.waitForSelector('.rbody');
  await scrollTo(reader, 1);
  await reader.click('.endnav a >> nth=0');
  await reader.waitForFunction(() => /Pertemuan/.test(document.querySelector('.rbody h1')?.innerText || ''));
  assert.equal(await reader.evaluate(() => Math.round(scrollY)), 0, 'bab baru mulai dari atas');
  await reader.click('#r-list');
  await reader.waitForSelector('.modal .chapters');
  await shot(reader, '09-daftar-bab');
  await reader.click('.modal .chapters a >> nth=2');
  await reader.waitForFunction(() => /Hujan/.test(document.querySelector('.rbody h1')?.innerText || ''));
  await reader.click('a[aria-label="Kembali ke novel"]');
  await reader.click('#fav');
  await reader.waitForFunction(() => document.querySelector('#fav span').innerText === 'Favorit');
  await reader.goto(srv.url + '/#/rak'); await reader.waitForSelector('.card');
  assert.match(await reader.innerText('.card .meta'), /Bab 3/);
  await reader.click('[data-t="fav"]');
  assert.match(await reader.innerText('.card h3'), /Langit Senja/);
  await shot(reader, '10-rak');
});

await step('Pencarian dan genre di beranda', async () => {
  await reader.goto(srv.url + '/#/'); await reader.waitForSelector('#q');
  await reader.fill('#q', 'tidak ada novel ini');
  await reader.waitForSelector('text=Tidak ada yang cocok');
  await reader.fill('#q', 'senja');
  await reader.waitForSelector('.card');
  await reader.click('.chip[data-g="Drama"]');
  assert.equal(await reader.locator('.card').count(), 1);
  await reader.click('.chip[data-g="Romansa"]');
  assert.equal(await reader.locator('.card').count(), 1);
});

await step('Pembaca tidak bisa membuka bab draf lewat alamat langsung; tidak ada akses admin', async () => {
  await admin.goto(srv.url + `/#/kelola/${novelId}`);
  await admin.waitForSelector('text=Bab (');
  const draftId = await admin.locator('.row', { hasText: 'Draf' }).locator('[data-edit]').getAttribute('data-edit');
  assert.ok(draftId, 'ada tepat satu bab draf');
  await reader.goto(srv.url + `/#/baca/${novelId}/${draftId}`);
  await reader.waitForSelector('text=tidak ditemukan');
  await reader.goto(srv.url + '/#/kelola'); await reader.waitForSelector('.page-head');
  assert.ok(!reader.url().includes('kelola'));
});

await step('Admin: kelola pembaca (nonaktifkan, reset password), pembaca nonaktif tidak bisa masuk', async () => {
  await admin.goto(srv.url + '/#/pembaca');
  await admin.waitForSelector('text=Pembaca (');
  await admin.locator('.row', { hasText: '@sinta' }).locator('[data-act]').click();
  await admin.click('.modal-foot .btn-danger');
  await admin.waitForSelector('text=Nonaktif');
  const p = await newPage();
  await p.goto(srv.url + '/');
  await p.fill('#a-user', 'sinta'); await p.fill('#a-pw', 'rahasia123'); await p.click('#a-go');
  await p.waitForSelector('#af-err .form-error');
});

await step('Akun: ganti nama, tema aplikasi gelap, keluar, sesi hilang', async () => {
  await reader.goto(srv.url + '/#/akun'); await reader.waitForSelector('#pf');
  await reader.fill('#p-name', 'Ani Baru'); await reader.click('#pf button');
  await reader.waitForSelector('.toast');
  await reader.click('#th [data-v="dark"]');
  assert.equal(await reader.getAttribute('html', 'data-theme'), 'dark');
  await shot(reader, '11-akun-gelap');
  await reader.click('#out'); await reader.click('.modal-foot .btn-primary');
  await reader.waitForSelector('#af');
  await reader.reload(); await reader.waitForSelector('#af');
});

await step('Tampilan desktop: beranda, pembaca, kelola', async () => {
  const d = await newPage({ width: 1280, height: 860 });
  await signIn(d, 'zeii');
  await d.waitForSelector('.card .cover img', { timeout: 8000 }).catch(() => {});
  await shot(d, '12-desktop-beranda');
  await d.click('.card'); await d.waitForSelector('.novel-head'); await shot(d, '13-desktop-detail');
  await d.click('.actions .btn-primary'); await d.waitForSelector('.rbody'); await shot(d, '14-desktop-pembaca');
});

await step('Tidak ada galat JavaScript di semua halaman', async () => { assert.deepEqual(pageErrors, []); });

await browser.close(); await srv.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} lulus`);
process.exit(failed.length ? 1 : 0);
