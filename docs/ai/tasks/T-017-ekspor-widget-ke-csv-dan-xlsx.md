---
id: T-017
title: Ekspor widget ke CSV dan XLSX
status: in_review
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-016
created: "2026-10-11T14:45:09Z"
updated: "2026-10-15T19:23:26Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 046944798220dd6d6383c6e0c212eee06378bb8f
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-15T16:54:29Z"
      findings: 10
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-15T17:48:21Z"
      findings: 5
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-15T18:40:32Z"
      findings: 3
    - "n": 4
      by: claude-verify-workflow
      at: "2026-10-15T19:22:48Z"
      findings: 1
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 37804
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1792092185770,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792092185792,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  103 passed (103)
            Tests  1485 passed (1485)
         Start at  02:23:00
         Duration  24.27s (tests 77%, import 16%, transform 7%, worker 1%)

          Isolate  103 workers spawned · ~131ms startup each (spawn + environment, per file)
                   at least ~1.37s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-15T19:23:26Z"
    tree: b5ecdc7db69544bb84fc87f5db45ce83a8e0b7015848623c46da773a98f68fb3
---

## Objective
Job ekspor hasil widget dengan filter aktif (jalur query tanpa limit 10k, maks 1 juta baris) ke CSV dan XLSX, ditulis ke exports/<userId>/<jobId>.*, unduh via presigned 1 jam, lifecycle hapus 1 jam. Dijalankan di worker (job ringan, antrean terpisah dari ingest).

## Acceptance criteria
- [ ] Given widget tabel dengan filter aktif, when ekspor CSV, then file berisi persis baris terfilter dengan header nama tampil kolom
- [ ] Given hasil > 1 juta baris, when ekspor, then ditolak code EXPORT_TOO_LARGE dengan saran mempersempit filter
- [ ] Given ekspor XLSX selesai, when 61 menit berlalu, then tautan unduh tidak lagi valid dan objek terhapus
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given sel atau nama kolom berawalan '=', '+', '-', '@', tab, atau CR, when ekspor CSV, then diawali tanda kutip tunggal; XLSX menulisnya sebagai string
- [ ] Given user B meminta GET /api/exports/<jobId>/download untuk job milik A, when dikirim, then 404; given pemilik, then 302 ke presigned 5 menit dengan response-content-disposition=attachment dan AuditLog ekspor tercatat

## Risk
Impact: jalur baru ekspor (POST/GET/download /api/exports, antrean + worker `export`, tabel Export, objek exports/ di storage) memakai ulang resolver query widget (diekstrak dari widgetResult) → regresi di resolver memengaruhi semua widget; worker menjalankan DuckDB ketiga (memori proses worker). Migrasi aditif: enum ExportStatus/ExportFormat + tabel Export.
Security (STRIDE): S — sesi wajib (requireUser), unduh hanya pemilik ekspor. T — spec diambil dari widget di DB (bukan klien), filter divalidasi D6 di create dan di worker, identifier SQL hanya c<pos>/_row, nilai di-bind, target COPY hanya di direktori kerja job. R — AuditLog dashboard.widget.export saat unduh (actor, widget, format, baris, peran, ip). I — akses per dashboard dicek tiga kali (buat, worker, unduh) sehingga pencabutan berlaku; pesan galat berbentuk peran (viewer tanpa nama kolom tersembunyi); formula CSV dinetralkan (= + - @ tab CR); presigned 5 menit, objek kedaluwarsa 60 menit lalu dihapus; nama file disanitasi (header injection). D — rate limit 30/10 menit + maks 2 ekspor berjalan per user, batas 1 juta baris dicek sebelum COPY, deadline 10 menit, DuckDB ekspor 512 MB. E — viewer/editor hanya jalur {widgetId, dashboardFilters}; mode bebas tidak diekspos.
Rollback: revert commit T-017 + turunkan migrasi manual (DROP TABLE "Export"; DROP TYPE "ExportStatus", "ExportFormat"); hapus prefix exports/ di bucket; antrean `export` di Redis boleh dihapus. Tidak ada perubahan data dataset/dashboard.
Validation: unit (netralisasi CSV lewat DuckDB nyata, XLSX round-trip lewat parser xlsx proyek, resolver sama dengan query widget, otorisasi 404/302/410, jam kedaluwarsa, argumen presign, guard hapus, batas baris), e2e (CSV = baris terfilter dengan header nama tampil, EXPORT_TOO_LARGE, kedaluwarsa 61 menit lewat skrip dev, unduh B 404 / pemilik 302 + audit, formula), review adversarial berulang sampai 0 temuan + design-reviewer, next build.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z Worker re-validasi filter terhadap allowedFilterColumns; streaming COPY … TO, bukan fetch 1 juta baris ke Node; pembersihan exports/ > 1 jam via job.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [ ] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [ ] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets
- [ ] V3 Session management: session tokens are random, protected, invalidated on logout and expiry
- [ ] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR)
- [ ] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template)
- [ ] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code
- [ ] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets
- [ ] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable
- [ ] V9 Communication: TLS for all external traffic; certificates validated
- [ ] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [ ] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [ ] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF
- [ ] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [ ] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date
