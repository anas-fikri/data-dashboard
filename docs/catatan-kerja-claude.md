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
- Push (keputusan pemilik 2026-10-20): pengembangan dilanjutkan dari sesi Claude Code cloud; push ke
  branch sesi `claude/intelligent-albattani-fd1va8` lewat remote `origin` sesi (tanpa force-push). Keputusan
  pemilik 2026-10-21: `main` dibuat dari branch sesi dan `worktree-t-001-scaffold` dimajukan (fast-forward)
  ke commit yang sama; selanjutnya `main` = cabang utama. Dari Mac tetap `worktree-t-001-scaffold` lewat SSH. Repo dibuat publik oleh
  pemilik 2026-10-20, jadi syarat cek 404 tidak berlaku lagi — tetap jangan commit rahasia (`aitk audit`
  memindai file terlacak).
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

## Posisi terakhir (2026-10-21, sesi cloud)

- G-6 dikerjakan dari sesi Claude Code cloud (branch `claude/intelligent-albattani-fd1va8`, Node 22.23.3 —
  Node 22.22 merusak worker thread xlsx). Selesai: T-040, T-gcn8, T-rrn1, T-041, T-042, T-044–T-047,
  T-049–T-060, T-qqyx. Tiap task: implementasi → review subagent → perbaikan → aitk close.
- Blocked menunggu pemilik (rinci di docs/ai/uat/T-064.md bagian D1–D6):
  - T-043/T-048: uji NVDA/VoiceOver + /frontend-expert:audit; keputusan aria-rowcount (total+2, ADR-0007).
  - T-023: **upgrade produksi SUDAH dijalankan 2026-10-21** (kode `190e216`, image `202610210737`, migrasi
    s.d. `t060_period_group`, semua gerbang lulus — rincian di Notes T-023). Sisa: uji manual pemilik §7
    langkah 6, quota-report kedua setelah 03.00 WIB, hapus `db-*.dump` setelah backup harian terverifikasi,
    salinan off-VM (NAS). Jangan jalankan upgrade lagi.
  - T-061/T-063: ukur performa dan backup di VM (scripts/perf-grid-vm.sh, scripts/perf-period-cycle-vm.sh).
  - T-062: keputusan target lompatan (terima gulir lanjutan / row group ingest lebih kecil / anggaran).
  - T-064: UAT pemilik (docs/ai/uat/T-064.md); jangan diterima atas nama pemilik.
  - T-h77x: tetap dikecualikan (NAS).
- Rekomendasi produksi 4 vCPU: GRID_MAX_CONCURRENCY=1; jangan naikkan PERIOD_SHEET_MAX_ROWS.
