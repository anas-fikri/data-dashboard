---
id: T-0gmm
title: Gabungkan sheet berkolom sama menjadi satu sheet saat unggah xlsx
status: in_progress
profile: strict
profile_pinned: true
created: "2026-11-11T05:32:56Z"
updated: "2026-11-11T05:51:03Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 6981253e664a76a34e71eddb1caacac3eb3111f3
---

## Objective
Pemilik bisa mengunggah data yang dipecah ke beberapa sheet (batas 1.048.576 baris Excel) sebagai satu sheet:
centang "Gabungkan sheet yang judul kolomnya sama" di pemilih sheet (xlsx, ganti semua data). Sheet terpilih
dengan jumlah + judul kolom sama menjadi satu Sheet logis (nama sheet pertama) dengan satu segmen per sheet
asal (manifest ordinal 0..n-1), tipe kolom dari gabungan profil; dashboard, pivot, Lihat data, ekspor membaca
semua baris. Tanpa deploy (pemilik yang deploy).

## Acceptance criteria
- [ ] Pemilih sheet (≥ 2 sheet terpilih) menampilkan centang 'Gabungkan sheet yang judul kolomnya sama'; dikirim ke server dan divalidasi (hanya xlsx ganti semua data, boolean, bukan 1 sheet); lanjut-unggah hanya untuk pilihan gabung yang sama
- [ ] Ingest menggabung sheet berjumlah + berjudul kolom sama (abaikan huruf besar/spasi, baris judul boleh beda) menjadi satu sheet bernama sheet pertama dengan satu segmen per sheet asal, _row berurutan, tipe dari gabungan profil; sheet lain tetap terpisah; tanpa pilihan = perilaku lama
- [ ] Query, Lihat data, ekspor membaca semua segmen sheet gabungan (e2e: count 900, aria-rowcount 902)
- [ ] Versi refresh gabungan: cocok → aktif dengan lineage pasangan; butuh pemetaan → FAILED dengan saran tanpa objek tersisa; unggah ulang data gabungan mencentang gabung bawaan
- [ ] Panduan 03, Yang baru 1.16, CHANGELOG (bermigrasi, tanpa --quick), runbook §26 + perintah deploy untuk pemilik (tanpa deploy dari sesi)

## Risk
Impact: jalur ingest REPLACE xlsx (loop per sheet di runIngest) + manifest multi-segmen untuk versi REPLACE;
migrasi kolom baru DatasetVersion.mergeSheets (DEFAULT false). Tanpa pilihan gabung, alur lama identik (uji
ingest 359 lulus). Pemetaan (mapping.ts) masih satu segmen per sheet → versi gabungan yang butuh pemetaan
digagalkan dengan pesan (bukan kehilangan data diam-diam); header sheet gabungan tidak bisa diganti (MULTI_HEADER).
Security (STRIDE): Tampering — input `mergeSheets` divalidasi ketat (hanya boolean true/false; hanya xlsx +
REPLACE; bukan 1 sheet) di validateInit; route meneruskan field eksplisit. Info disclosure/EoP: tidak ada jalur
akses baru (otorisasi unggah tetap pemilik dataset). DoS: beban = sheet yang sama di-parse seperti biasa + satu
profil per sheet asal; batas ukuran/baris/sheet tetap.
Rollback: image saja ke v1.15.x aman (kolom diabaikan, segmen tetap terbaca); upgrade.sh rollback memulihkan dump.
Validation: vitest ingest/merge-sheets (gabung, tipe gabungan, tanpa gabung, paralel = berurutan, refresh
cocok/tidak cocok), uploads service/init-period; e2e ingest T-0gmm (UI, 3 segmen, query count 900, Lihat data
902, unggah ulang tercentang bawaan).

## Notes
