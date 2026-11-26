# Zeii Ebook

Perpustakaan online untuk novel buatanmu. Pembaca daftar akun, membaca dengan tampilan nyaman (terang, sepia, gelap), dan progres baca tersimpan otomatis. Kamu (admin/penulis) mengunggah naskah Word, PDF, atau TXT, lalu web memecahnya jadi bab.

Semua gratis (Cloudflare Workers + Firebase gratis) dan bisa diatur dari HP.

## Fitur
**Untuk pembaca**
- Daftar dan masuk dengan username + password.
- Beranda: kartu "Lanjutkan membaca", pencarian judul/penulis, filter genre.
- Halaman novel: sampul, sinopsis, genre, status (berlanjut/tamat/jeda), jumlah kata, daftar bab, tombol favorit.
- Pembaca: tema terang/sepia/gelap, ukuran huruf, jenis huruf, jarak baris, lebar teks. Bilah atas dan bawah menyembunyikan diri saat menggulir. Posisi baca tersimpan dan dipulihkan, bahkan di perangkat lain.
- Rak: "Sedang dibaca" dan "Favorit".

**Untuk admin (penulis)**
- Menu **Kelola**: buat, ubah, hapus novel; draf atau terbit.
- **Impor naskah** `.docx` (disarankan), `.pdf`, `.txt`: bab dikenali dari judul ("Bab 1", "Chapter 2", Heading Word, Prolog, Epilog). Ada pratinjau: ubah judul, hilangkan bab, jadikan satu bab, atau pecah tiap 2.500 kata. File aslinya tidak diunggah, hanya teks bab.
- Tulis atau ubah bab manual, sembunyikan bab (draf), hapus bab.
- Sampul: unggah gambar apa saja (dipotong 2:3 dan dikecilkan otomatis). Tanpa sampul, dibuat sampul otomatis dari judul.
- Kelola pembaca: nonaktifkan akun, reset password.

## Cara memasang (dari HP, urut)
Kamu butuh akun Google, GitHub, dan Cloudflare (semua gratis).

### 1. Buat proyek Firebase BARU
Harus proyek baru, jangan pakai proyek Japanese Club (datanya akan tercampur).
1. console.firebase.google.com → **Create a project**, beri nama, matikan Google Analytics.
2. **Build → Authentication → Get started → Email/Password → Enable**.
3. **Build → Firestore Database → Create database** → pilih lokasi (mis. `asia-southeast2` Jakarta) → mode **production** (terkunci).
4. Roda gigi → **Project settings → General**: catat **Project ID**. Di bawah, **Add app → Web (`</>`)**, beri nama bebas, lalu catat `apiKey`.
5. **Project settings → Service accounts → Generate new private key**. Hasilnya file `.json`. Simpan baik-baik, jangan dibagikan.

### 2. Taruh kode di GitHub (tanpa upload folder)
Kamu tidak perlu membuka ZIP atau mengunggah folder.
1. Buat repo baru di GitHub (mis. `zeii-ebook`), centang "Add a README".
2. **Add file → Upload files** → pilih ZIP ini dan **ganti namanya jadi `update.zip`** (persis). Commit.
3. **Add file → Create new file**. Di kolom nama ketik `.github/workflows/terapkan-update.yml` (garis miring otomatis membuat folder), lalu tempel isi file `terapkan-update.yml` yang kamu terima terpisah. Commit.
4. Tab **Actions → Terapkan Update → Run workflow**. Setelah hijau, semua file sudah ada di repo.
5. Ulangi langkah 3 untuk file `.github/workflows/buat-admin.yml` (isinya dari file `buat-admin.yml`). Dua file ini harus ditempel manual karena GitHub melarang workflow membuat workflow.
Update berikutnya cukup: upload `update.zip` baru lalu jalankan **Terapkan Update** lagi.

### 3. Isi pengaturan
Di `wrangler.toml`, `FIREBASE_PROJECT_ID` dan `FIREBASE_API_KEY` sudah diisi untuk proyek Firebase `zeii-ebook`. Kalau memakai proyek lain, ganti keduanya.

### 4. Deploy di Cloudflare
1. dash.cloudflare.com → **Workers & Pages → Create → Import a repository** → pilih repo-mu → Deploy (perintah bawaan sudah benar).
2. Setelah jadi: **Settings → Variables and Secrets → Add** → tipe **Secret**, nama `FIREBASE_SERVICE_ACCOUNT`, isi: seluruh teks file `.json` dari langkah 1.5. Deploy ulang bila diminta.
3. Alamat webmu ada di bagian atas (`....workers.dev`).

### 5. Buat akun admin (penulis)
1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**: `FIREBASE_SERVICE_ACCOUNT` (isi sama seperti di atas) dan `ADMIN_PASSWORD` (password adminmu, min 8, huruf + angka).
2. **Actions → Buat Admin → Run workflow**, isi username (mis. `zeii`) dan nama.
3. Berhasil? Hapus secret `ADMIN_PASSWORD`. Masuk ke webmu dengan username dan password itu.

Lupa password admin? Jalankan **Buat Admin** lagi dengan username yang sama dan password baru di secret `ADMIN_PASSWORD`.

### 6. Mulai
Masuk → **Kelola → Novel baru** → isi judul → **Impor dari Word / PDF / TXT** → periksa pratinjau → **Tambahkan**. Bagikan alamat webmu. Pembaca daftar sendiri di layar masuk.

Menutup pendaftaran: ubah `REGISTRATION = "closed"` di `wrangler.toml`.

## Tips naskah supaya bab terbaca rapi
- Di Word, pakai gaya **Heading 1** untuk judul bab, atau ketik "Bab 1", "Bab 2: Judul". Pecahan juga bisa diatur manual di pratinjau.
- Satu baris kosong antar paragraf tidak wajib; tiap paragraf Word otomatis jadi paragraf.
- Pemisah adegan: baris berisi `***` atau `---`.
- Batas satu bab 120.000 huruf (sekitar 20.000 kata). Bab yang lebih panjang dipecah otomatis jadi "(2)", "(3)".
- PDF hasil scan (gambar) tidak bisa dibaca. Pakai Word asli bila ada.

## Batasan yang perlu kamu tahu
- Daftar bab dan sampul dimuat per halaman, cocok untuk puluhan novel dan ratusan bab. Untuk ribuan novel perlu penyesuaian.
- Impor PDF memuat pustaka pdf.js dari internet (CDN), butuh koneksi dan hasilnya kurang rapi dibanding Word.
- Belum ada: komentar, rating, notifikasi bab baru, urutan bab diubah dengan seret, unduh offline. Bilang bila mau ditambah.
- Kuota gratis Firebase (20 ribu tulis/hari) cukup untuk ratusan pembaca. Progres baca disimpan hemat (tiap ±7 detik berhenti menggulir).
- Keamanan: password dikelola Firebase Authentication; peran dicek di server; bab draf tidak bisa dibuka pembaca lewat alamat langsung; semua teks di-escape. Pembatas laju bersifat per-server Cloudflare, bukan global.

## Untuk pengembang
```
npm test          # 14 tes API + skrip (Firebase tiruan)
npm run test:e2e  # 16 langkah di Chromium sungguhan (butuh Playwright + python3)
```
Struktur: `backend/src` (Worker), `public` (web statis tanpa framework), `scripts/buat-admin.mjs`.
