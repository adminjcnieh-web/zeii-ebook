# Hasil pengujian Zeii Ebook

Diuji di sandbox pada 26 Nov 2026. Firebase dan Cloudflare yang dipakai adalah TIRUAN; belum diuji di layanan asli.

## Yang benar-benar dijalankan
**Tes API dan skrip (14, node:test) - lulus semua**
- Daftar pembaca (otomatis masuk, role tidak bisa dipaksa jadi admin, username kembar/pendek/password lemah ditolak, pendaftaran bisa ditutup).
- Wajib login, akun nonaktif ditolak, ganti password (butuh password lama), ganti nama.
- Admin: lihat pembaca, nonaktifkan, reset password; pembaca tidak boleh; admin tidak bisa dinonaktifkan.
- Novel: hanya admin yang membuat/ubah/hapus; draf tersembunyi dari pembaca; validasi status.
- Bab: tambah banyak, nomor lanjut, draf tersembunyi, isi + bab sebelum/berikut, validasi (kosong, terlalu panjang, terlalu banyak, karakter kontrol dibuang), ubah/hapus/hapus semua memperbarui hitungan, bab novel lain tidak bisa dibuka lewat novel ini.
- Hapus novel membersihkan bab, isi bab, sampul, dan rak.
- Sampul: unggah/ambil/hapus; bukan JPEG, bukan gambar, terlalu besar ditolak.
- Rak: favorit, simpan bab + posisi, pulih posisi, rak milik sendiri, hapus, novel ditarik hilang dari rak, batas laju.
- Skrip buat-admin: buat, reset password, tidak mengambil alih username pembaca, dan memperbaiki akun "yatim" (ada di Authentication tetapi tanpa profil) sisa percobaan gagal.

**Tes e2e di Chromium sungguhan (16 langkah) - lulus semua**
Daftar → rute admin tertutup untuk pembaca; salah password; admin buat novel; impor .docx (4 bab dikenali, judul dokumen jadi "Pembuka" tidak dicentang, ubah judul, simpan); impor .txt (nomor lanjut); unggah sampul PNG (dikecilkan di browser); ubah/sembunyikan/hapus bab; pembaca melihat beranda, detail, membaca (karakter khusus aman); pengaturan tampilan baca tersimpan setelah muat ulang; posisi gulir tersimpan dan dipulihkan, kartu "Lanjutkan membaca"; bab berikutnya mulai dari atas, daftar bab, favorit, rak; pencarian + genre; bab draf tidak bisa dibuka lewat alamat; nonaktifkan pembaca; ganti nama, tema gelap, keluar; tampilan desktop; tidak ada galat JavaScript (termasuk aturan CSP).
Tangkapan layar diperiksa langsung untuk beranda, detail, pembaca, pratinjau impor, dan sampul otomatis.

## Belum teruji nyata (jujur)
- Firebase, Firestore, dan Cloudflare asli (semuanya tiruan di sini).
- Impor **PDF**: butuh pdf.js dari CDN, tidak ada internet di sandbox. Logika pemecah bab teruji dengan teks, tetapi pembacaan PDF asli belum.
- Impor .docx buatan Word/Google Docs asli: yang diuji adalah .docx minimal buatan skrip. Gaya "Heading" dan teks biasa seharusnya sama, tetapi file dengan tabel/gambar/daftar bernomor belum dicoba.
- Layar sentuh asli (gulir, ketuk untuk menyembunyikan bilah), font Literata/Figtree dari Google Fonts (di sandbox memakai font cadangan).
- Beban banyak pembaca bersamaan dan kuota gratis Firebase pada pemakaian nyata.
