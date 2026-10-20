---
id: T-040
title: Jalankan ubah tipe kolom/recast sebagai job per segmen
status: in_review
profile: standard
goal: G-6
tags:
  - worker
  - schema
depends_on:
  - T-037
created: "2026-10-15T02:30:55Z"
updated: "2026-10-20T01:04:43Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: c1c8b0aa5fad938d37d2afe59c41499e085bba4f
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T01:03:00Z"
      findings: 3
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 70066
    summary: |-
      …"code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792458247120,"service":"data-dashboard","host":"127.0.0.1","port":51496,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792458247132,"service":"data-dashboard","host":"127.0.0.1","port":51505,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792458247145,"service":"data-dashboard","host":"127.0.0.1","port":51507,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792458247169,"service":"data-dashboard","host":"127.0.0.1","port":51511,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792458247283,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792458252290,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792458252312,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792458252317,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792458252322,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  163 passed (163)
            Tests  2112 passed (2112)
         Start at  08:03:51
         Duration  49.46s (tests 80%, import 16%, transform 4%)

          Isolate  163 workers spawned · ~207ms startup each (spawn + environment, per file)
                   at least ~3.55s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T01:04:43Z"
    tree: cc322764955722120c0a220964786e064447cdf62d9637be6e24907fda27e9b0
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
- **Antrean:** job recast kini berprioritas di bawah pemetaan. Selama ingest dataset lain berjalan atau pemetaan antre, job ditunda sebentar dan dilanjutkan dari titik lanjut ("yield").
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
  - Review putaran 1 (claude-reviewer-subagent: 0 Critical/High, 3 Medium, 6 Low) sudah diperbaiki: M1 tidak mengalah pada ingest dataset yang sama; M2 "yield" melepas slot antrean, bukan tidur; M3 indeks sheet diperpanjang per segmen dan batas "busy" dihitung sejak mulai menunggu; L1 `dropTyped` lewat DELETE … RETURNING dan kunci kembar tidak dihapus (dicek di DB dev); L2 semua ordinal dicek saat swap; L5 lookup tertunda per segmen; L6a fixture memakai skema sheet. L3/L4 → task lanjutan; L6b selesai bersama M2 (progres hanya saat segmen benar-benar mulai).
  - Asumsi raw `c<pos>` = posisi kanonik ≤ `colCount` segmen. Pemetaan periode (T-055) perlu peta kolom per segmen bila urutan kolom file berbeda.
- **e2e AC2 (worker dibunuh) tidak dijalankan:** lock job BullMQ 5 menit membuat stalled baru terdeteksi setelah ≥ 5 menit. Perilaku resume diuji di unit dengan DuckDB sungguhan + uji mutasi.
