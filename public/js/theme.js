// Menerapkan tema pilihan sebelum halaman tampil (mencegah kedipan). Berkas terpisah karena CSP melarang skrip inline.
try { var t = JSON.parse(localStorage.getItem('zeii.theme') || 'null'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* abaikan */ }
