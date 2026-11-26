// Sampul novel. Bila admin belum mengunggah gambar, sampul dibuat otomatis dari judul (tetap unik per novel).
import * as api from './api.js';
import { esc } from './utils.js';

const PALETTES = [
  ['#1f3d38', '#d9c9a3', '#8fb8a8'], ['#2b2f4a', '#e7d9c0', '#9aa5d6'], ['#4a2833', '#f0dccb', '#d89aa6'],
  ['#2f3a2a', '#e3e0c4', '#a9c08a'], ['#32424f', '#eadfd0', '#9fbfd0'], ['#4a3a24', '#efe2c6', '#d6b26a'],
  ['#3b2a4a', '#e9dcec', '#b79ad6'], ['#253d4a', '#dcebe6', '#7fc0b4'],
];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function wrap(title, max = 11) {
  const words = String(title).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

export function generatedCover(novel) {
  const h = hash(novel.id + novel.title);
  const [bg, fg, ac] = PALETTES[h % PALETTES.length];
  const lines = wrap(novel.title);
  const size = lines.some((l) => l.length > 9) ? 33 : 39;
  const start = 160 - ((lines.length - 1) * (size + 8)) / 2;
  const motif = h % 3;
  const art = motif === 0
    ? `<circle cx="200" cy="330" r="46" fill="${ac}" opacity=".9"/><path d="M0 380 Q 70 330 140 370 T 300 360 V450 H0Z" fill="${fg}" opacity=".16"/>`
    : motif === 1
      ? `<path d="M30 380 L110 290 L170 360 L220 300 L270 380 Z" fill="${ac}" opacity=".85"/><circle cx="236" cy="240" r="22" fill="${fg}" opacity=".9"/>`
      : `<g stroke="${ac}" stroke-width="3" fill="none" opacity=".9"><path d="M40 360 Q 100 300 160 360 T 280 360"/><path d="M40 385 Q 100 325 160 385 T 280 385"/><path d="M40 335 Q 100 275 160 335 T 280 335"/></g>`;
  return `<svg class="cover-svg" viewBox="0 0 300 450" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sampul ${esc(novel.title)}">
    <rect width="300" height="450" fill="${bg}"/>
    <rect x="14" y="14" width="272" height="422" fill="none" stroke="${fg}" stroke-opacity=".45" stroke-width="1.5"/>
    ${art}
    <text text-anchor="middle" fill="${fg}" font-family="Literata, Georgia, serif" font-weight="600" font-size="${size}">${lines.map((l, i) => `<tspan x="150" y="${start + i * (size + 8)}">${esc(l)}</tspan>`).join('')}</text>
    <text x="150" y="420" text-anchor="middle" fill="${fg}" fill-opacity=".7" font-family="Figtree, sans-serif" font-size="13" letter-spacing="2">${esc((novel.author || '').toUpperCase().slice(0, 28))}</text>
  </svg>`;
}

const urls = new Map(); // novelId:ver -> objectURL | Promise
async function fetchUrl(novel) {
  const key = `${novel.id}:${novel.coverVer}`;
  if (!urls.has(key)) urls.set(key, api.blob(`/api/novels/${novel.id}/cover`).then((b) => URL.createObjectURL(b)).catch(() => null));
  return urls.get(key);
}

/** HTML sampul (sinkron). Gambar asli dipasang menyusul lewat hydrateCovers(). */
export function coverHtml(novel, cls = '') {
  return `<div class="cover ${cls}" data-cover="${esc(novel.id)}" data-ver="${novel.coverVer || ''}">${generatedCover(novel)}</div>`;
}

export function hydrateCovers(root, novels) {
  const map = new Map(novels.map((n) => [n.id, n]));
  root.querySelectorAll('[data-cover][data-ver]:not([data-ver=""])').forEach(async (el) => {
    const n = map.get(el.dataset.cover);
    if (!n?.coverVer) return;
    const url = await fetchUrl(n);
    if (url && el.isConnected) el.innerHTML = `<img src="${url}" alt="Sampul ${esc(n.title)}" loading="lazy" />`;
  });
}

/** Mengecilkan gambar pilihan ke JPEG 300x450 (potong tengah) maksimal ~80 KB. Mengembalikan base64 tanpa awalan. */
export async function resizeCover(file) {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('File ini bukan gambar yang bisa dibuka.'); });
  const W = 300, H = 450;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const s = Math.max(W / bmp.width, H / bmp.height);
  g.drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
  for (const q of [0.85, 0.75, 0.65, 0.5, 0.4]) {
    const b64 = c.toDataURL('image/jpeg', q).split(',')[1];
    if (b64.length * 0.75 < 78000) return b64;
  }
  throw new Error('Gambar terlalu rumit untuk dikecilkan. Coba gambar lain.');
}
