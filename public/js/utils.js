export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

export function debounce(fn, ms = 250) {
  let t;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.flush = (...a) => { clearTimeout(t); fn(...a); };
  f.cancel = () => clearTimeout(t);
  return f;
}

const loaded = new Map();
export function loadScript(src) {
  if (loaded.has(src)) return loaded.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = resolve;
    s.onerror = () => { loaded.delete(src); reject(new Error('Gagal memuat pustaka. Periksa internet lalu coba lagi.')); };
    document.head.appendChild(s);
  });
  loaded.set(src, p);
  return p;
}

const nf = new Intl.NumberFormat('id-ID');
export const num = (n) => nf.format(n || 0);
export const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')} rb` : String(n || 0));
export const readMinutes = (words) => Math.max(1, Math.round((words || 0) / 220));

export function timeAgo(v) {
  if (!v) return '';
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} hari lalu`;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(v));
}

export const STATUS_LABEL = { berlanjut: 'Berlanjut', tamat: 'Tamat', jeda: 'Jeda' };

export function safeGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* diblokir: abaikan */ }
}

/** "Bab 1: Awal" bila judul belum memuat nomor; kalau sudah ("Bab 1: Awal"), tampilkan apa adanya. */
export const hasNumber = (title) => /^(bab|chapter|chap\.?|part|bagian|episode|ep\.?)\s*\d/i.test(String(title || ''));
export const chapterLabel = (no, title) => (hasNumber(title) ? title : `Bab ${no}: ${title}`);
