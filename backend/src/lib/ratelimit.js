// Pembatas request sederhana (jendela geser) di memori.
//
// CATATAN JUJUR: batasan ini berlaku per "isolate" Cloudflare, bukan global.
// Cukup untuk meredam penyalahgunaan ringan. Untuk perlindungan lebih kuat,
// aktifkan juga Rate Limiting Rules di dashboard Cloudflare (lihat README).
import { HttpError } from './http.js';

const buckets = new Map();
let lastSweep = 0;

export function rateLimit(key, max, windowMs, now = Date.now()) {
  if (now - lastSweep > 60000) {
    lastSweep = now;
    for (const [k, v] of buckets) {
      if (v.length === 0 || now - v[v.length - 1] > 10 * 60000) buckets.delete(k);
    }
  }
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    const wait = Math.ceil((windowMs - (now - hits[0])) / 1000);
    throw new HttpError(429, `Terlalu banyak percobaan. Coba lagi dalam ${wait} detik.`, 'rate_limited');
  }
  hits.push(now);
  buckets.set(key, hits);
}

export function resetRateLimits() {
  buckets.clear();
}
