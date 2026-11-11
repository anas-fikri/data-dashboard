---
id: T-0gmm
title: Gabungkan sheet berkolom sama menjadi satu sheet saat unggah xlsx
status: done
profile: strict
profile_pinned: true
created: "2026-11-11T05:32:56Z"
updated: "2026-11-11T06:51:55Z"
closed: "2026-11-11T06:51:55Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 6981253e664a76a34e71eddb1caacac3eb3111f3
paths:
  - CHANGELOG.md
  - content/panduan/03-unggah-data.md
  - docs/runbook-deploy.md
  - prisma/migrations/20261111000000_merge_sheets/migration.sql
  - prisma/schema.prisma
  - scripts/dev-upload-fixture.mjs
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/api/uploads/route.ts
  - src/components/datasets/upload-panel-state.ts
  - src/components/datasets/upload-panel.tsx
  - src/components/datasets/upload-sheet-picker.tsx
  - src/features/datasets/service.ts
  - src/features/ingest/ingest.ts
  - src/features/ingest/merge-sheets.ts
  - src/features/ingest/recast.ts
  - src/features/ingest/repo.ts
  - src/features/query/grid-repo.ts
  - src/features/uploads/client.ts
  - src/features/uploads/service.ts
  - src/features/whats-new/entries.ts
  - tests/e2e/ingest.spec.ts
  - tests/features/ingest/fakes.ts
  - tests/features/ingest/merge-sheets.test.ts
  - tests/features/uploads/init-period.test.ts
  - tests/features/uploads/service.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-11T06:02:16Z"
      findings: 5
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-11T06:05:39Z"
      findings: 4
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-11T06:06:12Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 215783
    summary: |-
      …setId":"t072mwbrfmkxds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794379853239,"service":"data-dashboard","host":"127.0.0.1","port":35039,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794379853293,"service":"data-dashboard","host":"127.0.0.1","port":37113,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794379853404,"service":"data-dashboard","host":"127.0.0.1","port":34645,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794379853511,"service":"data-dashboard","host":"127.0.0.1","port":35407,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794379867928,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794379873765,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794379873789,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794379873792,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794379873806,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  245 passed | 1 skipped (246)
            Tests  3281 passed | 10 skipped (3291)
         Start at  06:49:16
         Duration  142.60s (tests 79%, import 17%, transform 3%)

          Isolate  246 workers spawned · ~126ms startup each (spawn + environment, per file)
                   at least ~10.19s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.15.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-11T06:51:40Z"
    tree: fcfa312d5118c91f38de9b22c1c33d4021ae36f059ece59728ff12999466f761
  commits:
    - 3b06bc5
    - 4530e0b
    - 515f654
    - 58fd0d2
    - 803bb7b
    - 973f5ad
    - 9ef1150
    - b37b39c
    - d56a607
    - eaa3c13
  acceptance:
    total: 5
    done: 5
  audit:
    at: "2026-11-11T06:44:21Z"
    passed: true
    tree: fcfa312d5118c91f38de9b22c1c33d4021ae36f059ece59728ff12999466f761
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 545 dirs visited, 3942 inodes visited, 1 Extract calls, 88.371291ms elapsed, 88.371459ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.15.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Pemilik bisa mengunggah data yang dipecah ke beberapa sheet (batas 1.048.576 baris Excel) sebagai satu sheet:
centang "Gabungkan sheet yang judul kolomnya sama" di pemilih sheet (xlsx, ganti semua data). Sheet terpilih
dengan jumlah + judul kolom sama menjadi satu Sheet logis (nama sheet pertama) dengan satu segmen per sheet
asal (manifest ordinal 0..n-1), tipe kolom dari gabungan profil; dashboard, pivot, Lihat data, ekspor membaca
semua baris. Tanpa deploy (pemilik yang deploy).

## Acceptance criteria
- [x] Pemilih sheet (≥ 2 sheet terpilih) menampilkan centang 'Gabungkan sheet yang judul kolomnya sama'; dikirim ke server dan divalidasi (hanya xlsx ganti semua data, boolean, bukan 1 sheet); lanjut-unggah hanya untuk pilihan gabung yang sama
- [x] Ingest menggabung sheet berjumlah + berjudul kolom sama (abaikan huruf besar/spasi, baris judul boleh beda) menjadi satu sheet bernama sheet pertama dengan satu segmen per sheet asal, _row berurutan, tipe dari gabungan profil; sheet lain tetap terpisah; tanpa pilihan = perilaku lama
- [x] Query, Lihat data, ekspor membaca semua segmen sheet gabungan (e2e: count 900, aria-rowcount 902)
- [x] Versi refresh gabungan: cocok → aktif dengan lineage pasangan; butuh pemetaan → FAILED dengan saran tanpa objek tersisa; unggah ulang data gabungan mencentang gabung bawaan
- [x] Panduan 03, Yang baru 1.16, CHANGELOG (bermigrasi, tanpa --quick), runbook §26 + perintah deploy untuk pemilik (tanpa deploy dari sesi)

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
- 2026-11-11T06:06:14Z Review 3 putaran (claude-reviewer-subagent): r1 M1+4 Low diperbaiki; r2 M1' (kolom sheet diserap) diperbaiki; r3 0 blokir, 1 Low → T-01xj.
- 2026-11-11T06:44:20Z e2e penuh per proyek (515f654): 39 proyek lulus; data-view-a11y AC2+AC3 gagal = T-7377 (sudah diketahui, gagal juga di main/v1.14), AC1 lulus terpisah. Firefox/WebKit/pdf tidak tersedia di VM. Perbaikan r2 (d56a607) diuji unit + tsc; e2e ingest T-0gmm/T-85tb lulus sebelumnya.

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

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-11T06:51:40Z (215783 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 3b06bc5, 4530e0b, 515f654, 58fd0d2, 803bb7b, 973f5ad, 9ef1150, b37b39c, d56a607, eaa3c13
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-reviewer-subagent: 4 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
