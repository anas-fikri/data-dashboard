---
id: T-039
title: Hitung kuota dari byte data yang benar-benar tersimpan
status: in_progress
profile: standard
goal: G-6
tags:
  - quota
  - security
  - migration
depends_on:
  - T-038
created: "2026-10-15T02:30:55Z"
updated: "2026-10-19T22:30:19Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 1b2b9ab2a9813c2f0fee3be789538479965fdef2
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 102967
    summary: |-
      …"code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792448967233,"service":"data-dashboard","host":"127.0.0.1","port":55972,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792448967245,"service":"data-dashboard","host":"127.0.0.1","port":55982,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792448967273,"service":"data-dashboard","host":"127.0.0.1","port":55984,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792448967294,"service":"data-dashboard","host":"127.0.0.1","port":55988,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792448968897,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792448976750,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792448976818,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792448976820,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792448976827,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  162 passed (162)
            Tests  2099 passed (2099)
         Start at  05:29:06
         Duration  70.80s (tests 78%, import 17%, transform 4%)

          Isolate  162 workers spawned · ~289ms startup each (spawn + environment, per file)
                   at least ~4.92s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T22:30:19Z"
    tree: 3dca61c3fb9094f4021a2743c4ee85d638a41f4b5187d53f3d40d6a0d2c51872
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-7, Fase 1. Perkiraan 2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given pengguna dengan segmen hidup, file sumber yang belum dihapus, dan versi UPLOADING, when kuota dihitung, then pemakaian = byte segmen unik terujuk + byte sumber tersimpan + ukuran terdeklarasi UPLOADING, dengan setiap segmen dihitung sekali
- [ ] Given proyeksi melewati USER_STORAGE_QUOTA_BYTES, when init, then QUOTA_EXCEEDED 'terpakai X dari Y' sebelum byte pertama terunggah, sizeBytes tetap ukuran file, dan test multipart lama lolos
- [ ] Given migrasi makna kuota, then laporan pemakaian per pengguna tercetak, selama QUOTA_GRACE_DAYS pelanggaran hanya diberi peringatan, banner tampil di ≥ 80%, dan e2e kuota diperbarui

## Risk
Impact: init unggah (cek kuota baru + proyeksi parquet), transfer dataset admin (flag kuota penuh), layout semua halaman (banner kuota pengguna, query pemakaian di-cache 60 detik per pengguna), ingest/recast/pemetaan (mencatat ukuran file), pemeriksaan malam (mengisi ukuran file lama), env (QUOTA_GRACE_DAYS) dan compose (kuota kini diteruskan ke container). Migrasi: dua kolom BIGINT nullable, tanpa pemindahan data. Pengguna lama bisa melihat angka pemakaian berbeda (byte nyata: parquet + sumber 7 hari, bukan ukuran file unggahan).
Security (STRIDE): Denial of service (penyimpanan penuh) — kuota kini menghitung parquet dan sumber yang benar-benar tersimpan, jadi tidak bisa dilewati dengan unggahan berulang; proyeksi diperiksa di dalam transaksi berkunci advisory per pengguna sebelum multipart dibuat. Information disclosure — banner hanya menampilkan pemakaian pengguna sendiri; laporan per pengguna hanya lewat skrip di container (admin/ops). Tampering — tidak ada masukan pengguna baru (ukuran dari stat file worker / HEAD storage). Masa transisi tidak membuka celah: pengguna yang sudah penuh menurut hitungan lama tetap ditolak.
Rollback: revert commit T-039 (+ migrasi turun opsional: kolom byte tidak dibaca kode lama). Hitungan kuota kembali ke jumlah sizeBytes; banner hilang. docker-compose.prod.yml lama tidak meneruskan kuota (bawaan 20 GiB tetap).
Validation: unit — usageOf (segmen unik sekali, sumber tersimpan vs dihapus, FAILED setelah/sebelum ingest, UPLOADING), quotaDecision (proyeksi, masa transisi), quotaAlert (80%/>100%/tanggal transisi), quotaGraceUntil (migrasi + hari, cache), ukuran file tercatat = ukuran objek (ingest), backfill audit; admin transfer 76/76; full unit lulus; e2e uploads 9/9 (kuota baru + banner + multipart lama), admin 6/6, ingest 4/4; laporan quota-report jalan di DB dev; aitk check lulus.

## Notes
- Rumus (rencana §5.7): segmen unik terujuk versi hidup (raw + revisi typed terujuk, dedup per id) + file sumber yang masih tersimpan (bukan UPLOADING, sourceDeletedAt null, FAILED hanya bila pernah UPLOADED/etag) + sizeBytes UPLOADING. Proyeksi init = file + ±1,2× parquet (rasio tetap rencana; shortcut sampai T-049+ butuh rasio historis). Pemeriksaan ulang "setelah cast" (rencana §5.7) belum — masuk T-052/T-055.
- Masa transisi: QUOTA_GRACE_DAYS sejak _prisma_migrations.finished_at migrasi T-039; selama itu hanya yang muat menurut hitungan lama (jumlah sizeBytes non-FAILED + file) yang diterima dengan peringatan — yang penuh menurut hitungan lama tetap ditolak seperti sebelumnya.
- Review putaran 1 (claude-reviewer-subagent): High — unggahan yang ditolak completeUpload (markFailed mengisi ingestFinishedAt) dihitung sebagai sumber tersimpan → aturan FAILED kini memakai etag (hanya diisi saat UPLOADED); Medium — laporan "sebelum deploy" tidak bisa jalan (skrip + kolom belum ada) → runbook: SQL hitungan lama sebelum deploy, quota-report setelah migrasi + setelah audit malam pertama.
- Putaran 2 (claude-code): diff perbaikan dibaca ulang, 0 temuan; unit 103 (uploads+admin), e2e uploads 9/9.
- Ukuran segmen lama (legacy) diisi pemeriksaan malam; sampai itu dihitung 0 (dilaporkan sebagai "belum terukur").

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — satu fungsi pemakaian (userUsage) dipakai init unggah, transfer admin, banner, dan dicerminkan skrip laporan; tanpa layanan baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — banner memakai sesi layout yang sudah ada
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — pemakaian dihitung hanya untuk pemilik dataset (ownerId); banner hanya untuk pengguna itu sendiri; laporan per pengguna hanya lewat skrip di container
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — QUOTA_GRACE_DAYS divalidasi zod (0–90); ukuran file berasal dari stat worker/HEAD storage, bukan masukan pengguna
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat baca kuota di layout tidak menggagalkan halaman (tanpa banner, dicatat); pelanggaran masa transisi dicatat warn; pesan QUOTA_EXCEEDED menyebut angka terpakai/batas/proyeksi
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — kuota tidak pernah dipenuhi dengan menghapus data; banner tanpa isi data, hanya angka pemakaian sendiri
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — proyeksi file + ±1,2× parquet diperiksa di transaksi berkunci advisory per pengguna sebelum multipart dibuat; masa transisi hanya untuk yang masih muat menurut hitungan lama
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — kuota mencegah storage penuh oleh parquet + sumber 7 hari; query banner di-cache 60 detik per pengguna
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — kode QUOTA_EXCEEDED (409) tetap; pesan diperluas dengan proyeksi
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — QUOTA_GRACE_DAYS baru (bawaan 14), USER_STORAGE_QUOTA_BYTES kini diteruskan compose; npm audit 0 kerentanan
