---
id: T-0gmm
title: Gabungkan sheet berkolom sama menjadi satu sheet saat unggah xlsx
status: in_review
profile: strict
profile_pinned: true
created: "2026-11-11T05:32:56Z"
updated: "2026-11-11T06:02:16Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 6981253e664a76a34e71eddb1caacac3eb3111f3
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-11T06:02:16Z"
      findings: 5
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 193344
    summary: |-
      …t":"127.0.0.1","port":33451,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794376454925,"service":"data-dashboard","host":"127.0.0.1","port":45107,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794376455020,"service":"data-dashboard","host":"127.0.0.1","port":37513,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794376455130,"service":"data-dashboard","host":"127.0.0.1","port":41259,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794376458074,"service":"data-dashboard","datasetId":"t072mwbpevh8ds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794376468564,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794376479299,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794376479322,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794376479325,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794376479337,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  245 passed | 1 skipped (246)
            Tests  3279 passed | 10 skipped (3289)
         Start at  05:52:49
         Duration  127.41s (tests 80%, import 17%, transform 3%)

          Isolate  246 workers spawned · ~111ms startup each (spawn + environment, per file)
                   at least ~9.01s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.15.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-11T05:54:57Z"
    tree: 16ea317f28c7b5fbef600b8d34a308232a5d10f329c32dd1736ab8a6b885afa0
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

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: body POST /api/uploads (browser) → validateInit; worker membaca mergeSheets dari baris versi (DB), bukan dari klien
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Tidak ada endpoint baru; initUpload tetap memeriksa pemilik dataset (owner-only) sebelum versi dibuat; ingest memakai versionId dari job
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — mergeSheets hanya diterima true/false (selainnya INVALID); hanya xlsx + REPLACE dan bukan 1 sheet; route meneruskan field eksplisit; tidak ada SQL/OS dari input (judul kolom hanya dibandingkan di memori)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Pesan gagal gabungan (MergeError) bahasa awam tanpa detail internal; alasan verdict yang disertakan sudah tampil di alur pemetaan biasa
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Pilihan gabung ikut kunci resume (pilihan beda → unggahan baru); versi gabungan yang butuh pemetaan digagalkan (tidak masuk alur yang menulis ulang satu segmen); _row lewat allocateRows atomik per segmen
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Batas file/baris/sheet/ukuran tidak berubah; tiap sheet tetap di-parse dengan batas SAX yang sama; nama asal segmen hanya teks tampilan (bukan path)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Field mergeSheets divalidasi server; rate limit RULES.uploadInit dan cek Origin tetap
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini
