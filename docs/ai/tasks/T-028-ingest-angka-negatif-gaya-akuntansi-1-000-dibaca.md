---
id: T-028
title: 'Ingest: angka negatif gaya akuntansi ''(1.000)'' dibaca sebagai -1000'
status: in_progress
profile: standard
profile_pinned: true
tags:
  - bug
created: "2026-10-12T23:39:16Z"
updated: "2026-10-16T16:41:52Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 87afa6c392da94b699c74a59ae5fb19fd29a9b67
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 41583
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

      {"level":40,"time":1792168888891,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792168888915,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792168888921,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  117 passed (117)
            Tests  1688 passed (1688)
         Start at  23:41:22
         Duration  28.28s (tests 75%, import 18%, transform 6%, worker 1%)

          Isolate  117 workers spawned · ~133ms startup each (spawn + environment, per file)
                   at least ~1.59s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T16:41:52Z"
    tree: 9908acff0e706c38425bca4ffd3e28f5f88b84266918cd4ca130b94953be9a25
---

## Objective
Ditemukan verifikasi integritas T-011: RE.numId/RE.numUs di src/features/ingest/infer.ts tidak mengenali format kurung, sehingga sel '(1.000)' menjadi kosong dan hilang dari total.

## Acceptance criteria
- [ ] Given CSV/XLSX dengan sel '(1.000)' dan '(1.234,50)' di kolom angka id-ID, when di-ingest, then nilainya -1000 dan -1234,5 dan ikut dalam total widget
- [ ] Given teks dalam kurung yang bukan angka, when di-ingest, then tidak diubah menjadi angka

## Risk
Impact: inferensi + cast kolom integer/decimal (CSV dan xlsx): nilai yang seluruhnya angka dalam kurung tanpa tanda dibaca negatif; sebelumnya menjadi NULL (gagal cast) dan hilang dari total. Teks berkurung lain tidak berubah; kolom teks tetap apa adanya; data lama terkoreksi saat ingest ulang/koreksi skema. Security (STRIDE): tidak ada permukaan baru — pola regex konstan, nilai tetap di-bind lewat kolom, bukan teks SQL. Rollback: revert commit infer.ts. Validation: tes ingest DuckDB sungguhan (CSV id-ID desimal + bulat, xlsx teks berkurung + angka asli, teks berkurung non-angka); gagal tanpa perbaikan (uji mutasi).

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — perubahan hanya di inferensi + cast angka ingest (src/features/ingest/infer.ts acct); batas kepercayaan sama: file unggahan tidak tepercaya diproses worker
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak menyentuh otorisasi
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — pola regex konstan (RE2, pencocokan penuh) di SQL; nilai sel tidak pernah masuk teks SQL (kolom raw); hasil tetap divalidasi TRY_CAST + pola angka per locale; teks berkurung non-angka tidak diubah
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat/log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — nilai negatif gaya akuntansi kini ikut total widget (sebelumnya NULL diam-diam); kode bernol depan tetap mengikuti aturan kode yang sudah ada
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: batas parser/ingest tidak berubah
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru
