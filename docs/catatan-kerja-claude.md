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

## Posisi terakhir (2026-10-24 dini hari, sesi cloud)

- Deploy v1.5.0 (23:22Z) berhenti di gerbang pasca-migrasi T-gcn8 (salah alarm: `SegmentTyped.headerRow` NULL =
  baris judul segmen) → pemilik rollback ke v1.4.1 (tanpa kehilangan data). Perbaikan **T-7czr** + nodemailer
  10.2.1 → rilis **v1.5.1**; deploy ulang `bash deploy/release.sh` (tanpa `--quick`).
- Advisori zod (high, semua 3.x) → **T-fnvm** migrasi zod 4 berikutnya (keputusan pemilik: rilis v1.5.1 dulu).
  `aitk check` merah karena npm audit sampai T-fnvm selesai; T-7czr ditutup setelahnya.

## Posisi terakhir (2026-10-23 malam, sesi cloud)

- Selesai (done): **T-pxnn** (kotak cari pintar di semua daftar pilihan), **T-tzxt** (versi di footer), **T-tpfh**
  (batas uji kinerja panduan 1300 ms), **T-qqrd** (rilis satu perintah `deploy/release.sh` dari Mac, runbook
  §12–§13), **T-85tb** (pilih sheet saat unggah xlsx; migrasi `t85tb_selected_sheets`).
- Rilis **v1.5.0**: commit `chore(release): v1.5.0` di branch sesi; tag dibuat/di-push oleh `release.sh` dari Mac.
  Rilis ini bermigrasi → jalankan `bash deploy/release.sh` **tanpa** `--quick` (preflight tetap memaksa backup
  lengkap bila migrasi berbeda).
- Task lanjutan: **T-2myj** (temuan Low T-85tb), T-4q8n, T-d1ns, T-md84, T-yabt.

## Posisi terakhir (2026-10-22 sore, sesi rekan)

- Batch selesai (done): **T-k2ec** (editor atur kolom filter dari bilah filter), **T-vb7q** (filter bawaan per
  kolom filter), **T-zm9k** (dashboard contoh otomatis). Masing-masing review subagen sampai 0 temuan; suite e2e
  penuh per proyek lulus (Firefox/WebKit/pdf dilewati di VM).
- Rilis **v1.4.0** (satu rilis untuk T-c6z4 + batch; pemisahan v1.4.0/v1.5.0 tidak bisa dibuat bersih karena
  commit bercampur): commit `chore(release): v1.4.0` ada di branch, **tag belum di-push** (403 dari cloud) →
  pemilik membuat/push tag dari Mac (runbook-deploy §10). PR branch sesi → `main` dibuka.
- Task lanjutan: **T-4q8n** (lost update kolom filter + temuan Low review T-k2ec/T-vb7q), **T-d1ns**, **T-md84**.
- Lingkungan cloud: Docker Hub 429 → tarik image lewat `mirror.gcr.io/...` lalu `docker tag` ke nama asli;
  rustfs ber-digest → override compose sementara (`image: rustfs/rustfs:pinned`) di luar repo. Jangan jalankan
  `npm run worker` terpisah saat e2e (spec menyalakan worker sendiri).

## Serah-terima kedua (2026-10-22 siang, PAUSE)

Sesi rekan (akun Claude kedua) dijeda; diteruskan rekan berikutnya. Branch kerja tetap
`claude/intelligent-albattani-fd1va8` (posisi paling baru; `main` tertinggal). PR ke `main` belum dibuka.

**Selesai di sesi ini (status aitk done):** T-12zs (isian bawaan pintar + judul otomatis; review 6
putaran), T-c6z4 (npm audit sudah pulih), T-1k96 (widget baru mengisi baris; bug lama urungkan hapus
diperbaiki). Task lanjutan baru: **T-d1ns** (temuan Low judul otomatis).

**Antre (urut):** T-k2ec (editor atur kolom filter dari bilah filter — `setDashboardFilterColumns` di
src/features/dashboards/service.ts saat ini pemilik saja → `canEditWhere` + `denied(..., "edit")`; UI di
filters/filter-bar.tsx memakai ulang logika filter-columns-settings.tsx; tes sharing.spec.ts ±baris 1044
mengharapkan 403 untuk editor → ubah ke 200; panduan 08), T-vb7q (filter bawaan: simpan `default` per
entri Dashboard.filterColumns tanpa migrasi; tanpa ?f → bawaan, "Hapus semua" tulis `f={}`; cek alur
PDF/ekspor), T-zm9k (checkbox "Mulai dengan dashboard contoh" di dashboard-form.tsx; widget dibuat
server-side di createDashboard memakai smart-defaults.ts + checkConfig), lalu rilis v1.4.0 (T-c6z4) dan
v1.5.0 (batch) lewat `aitk release --tag` (push tag dari cloud ditolak → pemilik), PR ke `main`.

**Catatan lingkungan cloud (container baru):**
- Node 22.23.3: unduh dari nodejs.org dan ganti biner `node` di PATH (22.22 merusak worker xlsx).
- aitk: `git clone https://github.com/innaka-tech/ai-toolkit` (publik) lalu `go build -o /usr/local/bin/aitk ./cmd/aitk`.
- osv-scanner (wajib `aitk audit`): `GOBIN=/usr/local/bin go install github.com/google/osv-scanner/v2/cmd/osv-scanner@v2.2.2`.
- Docker: jalankan `dockerd` dulu; lalu `npm run secrets:dev`, `npm run compose:up`, `npx prisma migrate deploy`.
- Dev server: jalankan terlepas (`setsid nohup npm run dev ... &`) — tugas latar belakang dihentikan setelah 2 jam.
- Playwright 1.64 butuh chromium_headless_shell-1248; VM punya 1194 → buat folder 1248 berisi symlink
  (`cp -as` dari 1194 + `chrome-headless-shell` → `headless_shell`). Firefox/WebKit tidak ada (proyek
  data-view-scroll-firefox/webkit dilewati); renderer PDF menolak jalan sebagai root (e2e pdf dilewati).
- Suite penuh: jalankan per proyek dengan `--no-deps` berurutan (rantai dependensi berhenti di Firefox).
- Review: subagen independen dicatat `AITK_TOOL=claude-reviewer-subagent aitk review pass <id> --findings N`
  (task strict butuh satu pass dari "alat" selain pengerja); task strict juga butuh `aitk security
  checklist <id>` diisi dan `aitk audit` hijau sebelum close.
- Produksi: tetap hanya pemilik (Anas). Tidak ada deploy dari sesi ini.

## Serah-terima ke akun Claude lain (2026-10-22, PAUSE)

Pemilik menjeda sesi cloud ini dan pekerjaan diteruskan rekan pemilik dengan akun Claude sendiri.

**Mulai dari sini (rekan):**
1. Klon repo, `git checkout main && git pull`, lalu `git merge origin/claude/intelligent-albattani-fd1va8`
   (branch sesi lama = posisi paling baru, termasuk WIP T-12zs). Kerjakan di branch sendiri dan buka PR
   (pull request) ke `main`; pemilik yang menggabungkan. Tanpa force-push ke branch orang lain.
2. Node **22.23.3** (bukan 22.22 — worker xlsx rusak), `npm ci`, `aitk` (build dari repo
   `innaka-tech/ai-toolkit`: `go build -o /usr/local/bin/aitk ./cmd/aitk` — minta akses ke pemilik bila
   privat), layanan dev `docker compose -f docker-compose.dev.yml up -d`, `.env` lewat
   `npm run secrets:dev` (nilai rahasia tidak pernah dibagikan/di-commit), `npx prisma migrate deploy`.
3. Jalankan `aitk brief` dan ikuti. Aturan kerja + keamanan di atas tetap berlaku. **Produksi (olympus)
   hanya pemilik**: rekan menyiapkan perintah, pemilik menjalankan.

**Status saat dijeda:**
- **T-12zs** (isian bawaan pintar + judul otomatis) — status `in_progress`, kode WIP di-commit
  `wip(T-12zs)`: implementasi + uji unit `tests/components/smart-defaults.test.ts` + e2e disesuaikan
  sudah ditulis, Objective/Risk/Notes/checklist terisi, tetapi **`aitk check` dan e2e belum dipastikan
  lulus** dan belum direview. Langkah: `aitk check`, e2e `widgets` + `pivot` (`npx playwright test
  --project=<nama> --no-deps`), review, perbaiki, `aitk close`.
- Antre (urut): **T-1k96** widget baru mengisi baris; **T-k2ec** editor boleh mengatur kolom filter dari
  bilah filter (**keputusan pemilik 2026-10-22: editor dashboard boleh menambah filter**); **T-vb7q**
  filter bawaan per kolom; **T-zm9k** dashboard awal otomatis (setelah T-12zs). Latar belakang: analisa
  di task masing-masing + ringkasan di bawah.
- **T-c6z4** (pratinjau tabel pivot penuh di editor pivot tersimpan) — kode + review (0 blokir) +
  tes selesai (`3a16a5e`), status `in_review`; belum ditutup hanya karena `npm audit` di `aitk check`
  gagal (endpoint advisori npm membalas 503 — gangguan npm, dependensi tidak berubah). Saat npm pulih:
  `aitk check` lalu `aitk close`. Temuan Low → **T-md84**.
- **T-1tzp** selesai: video panduan `satu-pivot-banyak-widget` (adegan `pemilik-pivot-tersimpan` di
  scripts/record-guide-videos.ts). File video tidak di-commit; pemilik mengunggah lewat Admin → Panduan.
- Rilis berikutnya: **v1.4.0** (T-c6z4) dan **v1.5.0** (batch dashboard/filter) lewat
  `aitk release --tag` — tag tidak bisa di-push dari sesi cloud (403), pemilik mem-push tag dari Mac.
- Produksi saat dijeda: v1.3.0 → v1.3.1 sedang di-deploy pemilik (preflight lulus 2026-10-22); lalu seed
  panduan dengan `docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm worker ...`
  (runbook "Isi panduan").
- Ringkasan analisa penyederhanaan dashboard/filter: dashboard baru selalu kosong (±40 aksi untuk 3
  widget), isian bawaan "kolom pertama" (contoh "Total No."), judul tidak otomatis, widget menumpuk di
  kiri, panel ±15 isian, tidak ada filter bawaan, kolom filter jauh dari bilah filter, 5 istilah "saring".
  Usulan berikutnya setelah batch: panel dasar/lanjutan, duplikat dashboard, peta cakupan filter.

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
