---
id: T-pvq8
title: Panaskan cache parquet app saat versi baru aktif
status: todo
profile: standard
created: "2026-10-17T10:12:34Z"
updated: "2026-10-17T11:31:55Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: claude-code-reviewer-subagent
      at: "2026-10-17T11:31:30Z"
      findings: 11
    - "n": 2
      by: claude-code-reviewer-subagent
      at: "2026-10-17T11:31:31Z"
      findings: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given ingest versi selesai dan versi diaktifkan, when pemilik membuka dashboard pertama kali, then file parquet versi itu sudah ada di cache app (tanpa unduh saat permintaan pertama) dan waktu buka dashboard pertama setara buka berikutnya
- [x] Given cache app penuh atau storage gagal saat pemanasan, when pemanasan berjalan, then aktivasi versi tetap berhasil, kegagalan dicatat di log, dan query pertama tetap mengunduh seperti sebelumnya

## Risk
- Impact: saat versi dataset aktif (ingest/pemetaan selesai di worker, rollback di app), versionId diumumkan lewat Redis pub/sub dataset:version-activated; setiap proses app (subscriber dari instrumentation.ts) memanaskan cache parquet lokalnya untuk versi itu (typedKey per sheet, satu versi + satu file sekaligus, ≤ separuh cache per versi, antrean ≤ 8). Singleton cache parquet pindah ke local-parquet.ts (localParquetCache via globalThis); PrismaClient kini satu per proses di semua lingkungan.
- Security (STRIDE): Tampering/Spoofing — payload pub/sub tidak dipercaya: harus berbentuk id, lalu DB memastikan versi READY + aktif sebelum mengunduh; Redis butuh password (REDIS_URL). Information disclosure — hanya mengisi cache lokal proses dengan kunci yang sama dengan query; pembacaan tetap lewat pemeriksaan akses query; dataset dihapus selagi dipanaskan → dicek ulang sebelum tiap unduhan + forget membatalkan unduhan. DoS — timeout 30 s per langkah DB/HEAD, 30 menit per versi, unduhan ≤ 10 menit (cache), memakai ≤ 1 dari 2 slot unduh; log Redis putus dibatasi 1×/menit.
- Rollback: revert commit T-pvq8 (tanpa migrasi). Pesan yang tertinggal di Redis tidak berdampak (tanpa pelanggan). Perilaku kembali ke unduhan saat query pertama.
- Validation: vitest warm (sekali per versi, dedupe, satu versi sekaligus, versi tidak aktif tidak diunduh, batas separuh cache, cache penuh/storage/DB gagal dicatat tanpa melempar, timeout langkah/run, cek ulang per file, typedKey berubah dilewati, watchRedis), warm-runtime, versions/service (rollback mengumumkan, gagal tidak); 385 test terkait lolos; verifikasi proses app dev sungguhan (log 'cache parquet versi aktif dipanaskan'); review 2 putaran (11 → 0).

## Notes

- 2026-10-17T11:31:31Z Diverifikasi di proses app dev sungguhan: pesan dataset:version-activated diterima 1 pelanggan, log 'cache parquet versi aktif dipanaskan' (1 file, 807.551 B, 115 ms). AC1 berlaku bila dashboard dibuka sesudah pemanasan selesai (di olympus HDD ± 109 s untuk 600 MB); dibuka lebih awal = bergabung ke unduhan yang sedang berjalan. Hasil query (DuckDB) tetap dingin pada buka pertama. Ukur di UAT lewat field ms pada log. Lanjutan: umumkan juga setelah recast.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan baru: worker/app → Redis pub/sub (kanal dataset:version-activated) → subscriber app (instrumentation, koneksi khusus mode subscribe) → DB (cek versi aktif) → storage → cache parquet lokal
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A untuk pengguna; Redis memakai URL berpassword yang ada
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — pemanasan tidak melayani pengguna; data hanya masuk cache lokal proses dengan kunci typedKey yang sama dengan query, dan setiap pembacaan tetap lewat pemeriksaan akses query yang ada
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — payload pub/sub harus berbentuk id (isIdShape), selain itu dibuang tanpa log isi; versi harus READY dan aktif menurut DB sebelum unduh
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — semua galat pemanasan dicatat warn tanpa melempar (aktivasi tidak pernah gagal karena pemanasan); log Redis putus dibatasi 1×/menit + info saat pulih; payload tidak sah tidak dilog
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — dataset dihapus selagi dipanaskan: versi dicek ulang sebelum tiap unduhan dan forget membatalkan unduhan berjalan; file lokal mengikuti aturan eviksi cache yang ada
- [x] V9 Communication: TLS for all external traffic; certificates validated — Redis internal di jaringan compose; tidak ada panggilan keluar baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit + osv-scanner 0 temuan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — pengumuman hanya sesudah commit aktivasi (ingest/pemetaan done, rollback sukses); dedupe pemicu per versi; antrean ≤ 8; ≤ separuh cache per versi; satu file sekaligus
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — timeout 30 s per langkah DB/HEAD, 30 menit per versi, 10 menit per unduhan; file lebih besar dari cache dilewati; file yang dipakai query tidak dievict
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada endpoint baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — instrumentation.ts hanya di runtime nodejs, galat impor ditangkap; PrismaClient satu per proses (globalThis) di semua lingkungan
