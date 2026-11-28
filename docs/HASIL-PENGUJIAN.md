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

## Tampilan baru (v2)
- Warna indigo + safron (mode gelap: safron di atas ungu tua), huruf judul Young Serif, bacaan Literata, antarmuka Plus Jakarta Sans.
- Sampul dibuat seperti buku (punggung, tepi halaman, bayangan), beranda punya kartu unggulan berwarna sesuai sampul, "Rak terbaru" dengan papan rak, halaman novel punya latar warna sampul.
- Tes: 14 tes API/skrip lulus, 16/16 e2e lulus. Dilihat lewat tangkapan layar Chromium (HP 390px dan laptop 1100px, terang dan gelap).
- **Belum dilihat:** huruf asli dari Google Fonts (sandbox memblokirnya, jadi yang terlihat huruf cadangan), HP sungguhan, dan sampul hasil unggahan foto asli.

## Deteksi 25 bab sekaligus
- Pemecah bab kini juga mengenali penomoran polos ("1", "2." atau "3. Judul" yang naik berurutan dari 1), selain "Bab/Chapter/Part/Episode N". Pratinjau melaporkan "Terdeteksi N bab (nomor a sampai b)", nomor yang loncat, dan nomor ganda.
- Tes (1): 25 bab dengan 6 gaya judul berbeda terdeteksi semua; 2 bab dihapus (7 dan 12) dilaporkan hilang. Total 15 tes API/skrip, 16/16 e2e.
- **Belum dicoba:** file Word/PDF novelmu yang sebenarnya. Kalau judul bab di file-mu bergaya lain, kirim contohnya supaya kusesuaikan.

## Impor PDF novel sungguhan ("Untuknya September", 292 halaman)
- Dicoba dengan data posisi teks dari PDF contoh milik pengguna (hasil `pdftotext -bbox-layout`, tidak disimpan di paket): terdeteksi **24 bab bernomor + Kata Pengantar, Prolog, Epilog**; judul ke-24 bab sama persis dengan daftar isi; nomor halaman, kepala halaman berulang, daftar isi dibuang; paragraf dikenali dari lekuk baris (halaman genap/ganjil beda margin ditangani); kalimat yang terpotong antarhalaman disambung; judul dua baris digabung; judul HURUF KAPITAL diubah jadi "Huruf Awal Kapital". Halaman judul/hak cipta jadi "Pembuka" (tidak dicentang).
- Tes otomatis (1) memakai halaman tiruan dengan pola yang sama. Total 16 tes API/skrip, 16/16 e2e.
- **Belum teruji:** pembacaan PDF oleh pustaka pdf.js di browser sungguhan (CDN tidak terjangkau dari sandbox; yang diuji hanya tahap setelah teks dibaca), dan kecepatan memproses 292 halaman di HP.
