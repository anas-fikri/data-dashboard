# Catatan kerja untuk sesi Claude (pindah PC)

Salinan memori sesi Claude di Mac pemilik, agar sesi di PC lain bekerja dengan aturan yang sama. Status task,
handoff, dan pengetahuan proyek ada di aitk (`aitk brief`); berkas ini hanya kesepakatan kerja + posisi
terakhir. Tanpa rahasia — nilai `.env`/`.env.prod`, password, dan kunci tidak pernah ditulis di sini.

## Kesepakatan kerja

- **Bahasa**: semua yang dibaca pemilik dalam bahasa Indonesia; setiap singkatan dijelaskan, mis.
  "AC (acceptance criteria/kriteria penerimaan)". Gaya ringkas (caveman) + perubahan terkecil yang tuntas
  (ponytail): akhiri balasan dengan 1–2 baris apa yang dilewati/tidak dicek dan risikonya.
- **Cakupan**: selesaikan semua task aitk kecuali T-h77x (salin backup ke NAS — menunggu NAS dikosongkan
  admin). G-6 (Lihat data + data per periode) dikerjakan. Bila butuh keputusan pemilik, ambil keputusan
  standar yang aman lalu catat asumsinya.
- **Gerbang review** (dipercepat 2026-10-16): yang memblokir hanya temuan Critical/High atau bug
  fungsional (nilai salah, data hilang, keamanan, aksesibilitas penghambat); maksimal 3 putaran; temuan
  kosmetik → task lanjutan. Satu reviewer + konfirmasi alat lain (`aitk review pass`). Setelah perbaikan
  jalankan e2e terarah saja (`npx playwright test --project=<nama> --no-deps`); suite penuh sekali sebelum
  close.
- **UI**: lewat skill plugin `frontend-expert`; ikon hanya `@tabler/icons-react` (Lucide hanya bila
  Tabler tidak punya, jangan dicampur dalam satu komponen).
- **Tanpa perubahan arsitektur besar** di luar rencana (`docs/ai/plans/…`, ADR).

## Batasan keamanan (tetap berlaku)

- Jangan mencetak isi `.env`/`.env.prod` dan jangan menyimpan rahasia di memori/repo/tes (tanpa password
  asli di tes).
- Push hanya ke branch `worktree-t-001-scaffold` (bukan main/master, tanpa force-push, tanpa merge), lewat
  SSH `git@github-personal:anas-fikri/data-dashboard.git` (bukan `gh`), dan hanya setelah
  `curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/anas-fikri/data-dashboard`
  menjawab 404 (repo masih privat).
- Deploy produksi dijalankan pemilik: siapkan skrip/perintah, minta pemilik menjalankannya. Selalu backup
  DB dulu.
- Server `ssh olympus`: aplikasi di `/data/docker-data/<folder>`; database PostgreSQL 14 di host (bukan
  container); jangan menyentuh folder/container aplikasi lain. Jangan mencoba login SSH berulang
  (fail2ban) — berhenti dan tanya setelah gagal.
- Lokal (Mac pemilik, Docker = OrbStack): jangan menyentuh container proyek lain (global_postgres,
  ictnotesv3-*, operation-system-*); restart OrbStack minta izin pemilik.
- Kunci API dimasukkan pemilik sendiri (Keychain); kunci privat age tidak pernah di VM; kunci admin NAS/S3
  tidak dipakai di VM bersama; bucket silo `ekas-pcptransport` tidak dipakai.
- Jangan menerima UAT atas nama pemilik; jangan mengubah status/bukti task aitk dengan tangan.

## Setup di PC baru

1. Klon repo lewat SSH, `git checkout worktree-t-001-scaffold`.
2. Node 22 (`.nvmrc`), `npm ci`, pasang `aitk` (CLI aitk; lihat `aitk.toml`).
3. Layanan dev (PostgreSQL 16, Redis 7, RustFS/S3, Mailpit) — lihat `README.md` dan `docker-compose*.yml`.
4. `.env` dari `.env.example`; nilai rahasia diisi pemilik sendiri.
5. `npx prisma migrate deploy`, lalu `npm run dev` (port 3100) dan `npm run worker` di terminal kedua.
6. Mulai sesi dengan `aitk brief` dan ikuti isinya (task aktif, handoff terakhir, perintah berikutnya).

Masalah dev yang pernah terjadi: setelah restart `next dev`, halaman bisa reload terus ("HMR hash
mismatch") → hentikan dev, `rm -rf .next/dev`, nyalakan lagi, panaskan halaman, baru e2e. e2e paralel
dengan beban mesin tinggi bisa timeout transaksi (P2028) — jalankan per project.

## Posisi terakhir (2026-10-20)

- Task aktif: **T-040** (recast per segmen), commit `b30aea5` + catatan `9298e14`. Review putaran 1
  (subagen): 0 Critical/High, 3 Medium, 6 Low. Sedang diperbaiki:
  - M1: jangan mengalah pada ingest dataset yang sama (koreksi skema jadi "stale");
  - M2: saat ingest lain berjalan, recast melepas slot antrean (job ditunda, dilanjutkan dari titik
    simpan) agar job pemetaan tidak tertahan;
  - M3: TTL indeks job berjalan per sheet diperpanjang per segmen; batas tunggu "busy" dihitung sejak
    mulai menunggu, bukan sejak job dibuat;
  - L1 (`dropTyped` hanya kunci yang benar terhapus), L2 (cek semua ordinal saat swap), L5 (lookup
    tertunda per segmen), L6a (`scripts/dev-segments.ts` memakai keputusan tipe tingkat sheet);
  - L3/L4 (baris judul + peta kolom per segmen untuk unggahan periode) → task lanjutan sebelum T-052.
- Setelah T-040: G-6 lanjut T-041…T-064, lalu T-rrn1. Produksi masih tertinggal (deploy14 + migrasi
  T-036…T-040 belum dijalankan; perlu backup DB, `check-segments.mjs`, `quota-report.mjs`).
