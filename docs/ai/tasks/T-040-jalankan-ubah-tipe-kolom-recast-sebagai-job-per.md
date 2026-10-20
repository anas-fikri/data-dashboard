---
id: T-040
title: Jalankan ubah tipe kolom/recast sebagai job per segmen
status: in_progress
profile: standard
goal: G-6
tags:
  - worker
  - schema
depends_on:
  - T-037
created: "2026-10-15T02:30:55Z"
updated: "2026-10-19T23:40:33Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: c1c8b0aa5fad938d37d2afe59c41499e085bba4f
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 168388
    summary: |-
      …code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792453132539,"service":"data-dashboard","host":"127.0.0.1","port":50489,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792453132550,"service":"data-dashboard","host":"127.0.0.1","port":50498,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792453132589,"service":"data-dashboard","host":"127.0.0.1","port":50500,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792453132617,"service":"data-dashboard","host":"127.0.0.1","port":50504,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792453145243,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792453145268,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792453145271,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792453145304,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792453150446,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  163 passed (163)
            Tests  2111 passed (2111)
         Start at  06:38:26
         Duration  123.06s (tests 78%, import 18%, transform 3%)

          Isolate  163 workers spawned · ~476ms startup each (spawn + environment, per file)
                   at least ~8.15s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T23:40:33Z"
    tree: 4079170d19be085a8e404e69f268df9ed4de8c3f971ced8a987adefeecae5761
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-8, Fase 1. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given sheet 24 segmen, when pemilik mengubah tipe kolom, then job per segmen berjalan dengan prioritas di bawah ingest, progres 'Segmen 7 dari 24' tampil, dan revisi baru aktif atomik hanya setelah semua segmen selesai
- [ ] Given worker mati di tengah recast, when worker hidup lagi, then segmen yang sudah selesai tidak diulang dan hasil akhir identik
- [ ] Given versi lama berbagi segmen, when recast selesai, then typed revisi lama tetap utuh sehingga rollback tetap bisa
- [ ] Given kolom tersembunyi baru ditambahkan, then segmen lama tidak di-cast ulang (diproyeksikan NULL)

## Risk
Impact:
- **Recast.** Seluruh koreksi skema tipe/format/baris judul kini memakai jalur baru. Sheet satu segmen (semua data produksi saat ini) diproses dengan alur yang sama, tetapi:
  - recast tanpa perubahan cast tidak lagi menulis file baru (revisi tetap naik);
  - file lama dibaca profilnya sekali pada recast pertama.
- **Ingest dan pemetaan:** ikut menyimpan profil raw (JSONB kecil, field ≠ 0) per file typed.
- **Antrean:** job recast kini berprioritas di bawah pemetaan, dan worker recast menunggu selama ingest berjalan.
- **UI:** banner koreksi skema menampilkan "Segmen k dari N" bila N ≥ 2.
- **Migrasi:** satu kolom JSONB nullable, tanpa pemindahan data.
- **Batasan baru:** sheet beberapa segmen tidak bisa memilih ulang baris judul (belum ada di produksi).

Security (STRIDE):
- **Tampering.** Masukan pengguna tetap divalidasi `parseRecastInput` di app dan worker. SQL baru hanya memakai posisi `Math.trunc` dan path `lit()`. Progres dari Redis divalidasi `recastProgressOf` sebelum dikirim ke UI.
- **Information disclosure.** Status polling tetap memeriksa kepemilikan sheet aktif; progres hanya berisi angka.
- **Denial of service.** Tenggat 20 menit per segmen. Penantian ingest dibatasi 15 menit per segmen, jadi recast tidak macet selamanya. File tertunda yang tidak pernah aktif disapu GC setelah 24 jam, atau dihapus langsung saat job berakhir tanpa aktif.
- **Repudiation.** Tidak berubah (log worker per job).

Rollback:
- Revert commit T-040.
- Kolom `SegmentTyped.profile` boleh dibiarkan (tidak dibaca kode lama) atau dibuang dengan migrasi turun.
- Baris SegmentTyped tertunda tanpa manifest disapu GC seperti revisi lama.
- Manifest yang sudah ditukar tetap valid untuk kode lama (satu segmen per sheet di produksi).

Validation:
- **Unit `recast.test.ts` (27 tes):**
  - AC1: 24 segmen, progres berurutan, swap sekali setelah 24 file tercatat dengan manifest lama utuh sampai swap, `float` diputuskan dari gabungan sehingga semua file DOUBLE, gagal di segmen 13 membuat revisi lama tetap aktif, menunggu ingest;
  - AC2: worker mati di segmen ke-4, lalu percobaan ulang hanya menulis 3 sisanya dan profil tidak dibaca ulang, hasil identik dengan run bersih;
  - AC3: file dan baris revisi lama utuh, gcPlan tidak menandai/menyapu, rollback membaca data lama;
  - AC4: kolom tersembunyi baru hanya di segmen terakhir, jadi hanya 1 unduh/unggah, segmen lama tetap tanpa c3, nullPct 0,75;
  - integritas: file yang dipakai ulang hilang → gagal tanpa aktivasi.
- **Uji mutasi:** 4 mutan (lewati resume, tulis semua, profil segmen pertama saja, tidak menghapus file tertunda) semuanya terdeteksi.
- **Unit lain:** profile.test (pack/unpack/merge/versi), schema.test (progres status), segments.test (rowBase).
- **Pemeriksaan penuh:** full unit 2111 lulus, aitk check lulus.
- **e2e:** recast-segments 1/1 (24 segmen, banner "Segmen k dari 24", file baru semuanya dibuat setelah ingest lain selesai, manifest revisi 2 sekaligus, count 480.000 baris), schema 7/7, ingest 4/4, mapping 4/4, versions 7/7.

## Notes
- **"Job per segmen" = satu job BullMQ per koreksi, mengerjakan segmen sebagai unit kerja.** Setiap segmen punya tenggat 20 menit sendiri, titik lanjut, dan progres. Alasannya: satu swap atomik dan satu lock per sheet tetap sederhana; flow parent/child BullMQ tidak dipakai.
- **Keputusan tipe dari gabungan profil raw semua segmen** (`SegmentTyped.profile`). Satu skema menghasilkan tipe fisik `c<pos>` yang sama di semua file, sehingga daftar `read_parquet` T-037 tetap sah.
  - Jumlah unik digabung sebagai perkiraan (shortcut di `profile.ts`, hanya untuk tampilan).
  - `PROFILE_VERSION` = hash SQL profil: SQL berubah membuat profil lama dihitung ulang dari raw.
- **Kontrak R21 dicek ulang:**
  - T-016: status polling recast tetap memeriksa kepemilikan sheet aktif; progres hanya angka.
  - T-017: ekspor membaca sumber lewat `sheetSource`/`withSegments` (T-037), tidak diubah.
- **Batasan yang diketahui:**
  - Recast aktif tidak memberi jalan ke job pemetaan yang datang setelahnya (concurrency 1). Prioritas hanya berlaku untuk job yang antre, dan untuk ingest yang sedang berjalan (ditunggu).
  - Indeks job berjalan per sheet ber-TTL 2 jam: recast > 2 jam memungkinkan koreksi kedua masuk antrean. Koreksi itu menunggu "busy" ≤ 30 menit, lalu diulang dengan backoff.
  - Asumsi raw `c<pos>` = posisi kanonik ≤ `colCount` segmen. Pemetaan periode (T-055) perlu peta kolom per segmen bila urutan kolom file berbeda.
- **e2e AC2 (worker dibunuh) tidak dijalankan:** lock job BullMQ 5 menit membuat stalled baru terdeteksi setelah ≥ 5 menit. Perilaku resume diuji di unit dengan DuckDB sungguhan + uji mutasi.
