// Pengaturan frontend. Tidak ada rahasia di sini.
//
// Catatan: website ini TIDAK memuat Firebase SDK. Login dan semua data lewat API server
// (folder backend/), jadi tidak ada konfigurasi Firebase (apiKey, dll) yang perlu ada di browser.
// Konfigurasi Firebase hanya ada di backend/wrangler.toml dan rahasia server.

export const API_BASE = ''; // kosong = alamat yang sama dengan website (default)
export const CLUB_TZ = 'Asia/Jakarta'; // zona waktu tampilan (WIB)

// Pustaka pihak ketiga dimuat saat dibutuhkan (versi dikunci).
export const LIBS = {
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  qrcode: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
  jsqr: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  exceljs: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
};

export const QR_POLL_MS = 5000; // seberapa sering layar QR memeriksa daftar hadir
