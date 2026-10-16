---
id: T-033
title: Teruskan sheetMap saat aktivasi ingest biasa (R5-1)
status: in_progress
profile: standard
goal: G-5
tags:
  - bug
  - ingest
created: "2026-10-15T02:30:54Z"
updated: "2026-10-16T18:09:06Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: d015a22563ec39ccbd9677b890b1d2a301e04afe
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 41642
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

      {"level":40,"time":1792174123105,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792174123128,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792174123133,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  119 passed (119)
            Tests  1700 passed (1700)
         Start at  01:08:36
         Duration  28.18s (tests 76%, import 17%, transform 6%, worker 1%)

          Isolate  119 workers spawned · ~126ms startup each (spawn + environment, per file)
                   at least ~1.54s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T18:09:06Z"
    tree: 1d362468f39658da91d99021f6af0c6f55d2c4b45109b67755ff6ffa9a5af3f3
---

## Objective
Bug saat ini (temuan T-014 R5-1), dipisah dari rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md (P-3, Q7): aktivasi ingest biasa ('Ganti semua') belum meneruskan sheetMap ke activateVersionInTx sehingga widget pada rantai alias bisa SHEET_UNAVAILABLE. Perkiraan 0,5–1 hari. Peta kode: catatan T-015.

## Acceptance criteria
- [ ] Given widget pada sheet dengan rantai alias ambigu, when file 'Ganti semua' diaktifkan otomatis, then widget tetap terpasang dan tidak SHEET_UNAVAILABLE
- [ ] Given unit test ingest dan FakeRepo.finish, then sheetMap dari loop sheet ingest.ts diteruskan ke repo.finish → activateVersionInTx dan teruji

## Risk
Impact: aktivasi otomatis ingest biasa ('Ganti semua') kini memakai pasangan sheet pasti dari planSheets (sheet aktif → sheet versi baru) sebelum tebakan nama/alias matchSheet; widget pada rantai alias ganda tidak lagi tertinggal SHEET_UNAVAILABLE. Tanpa pasangan (versi pertama, sheet baru) perilaku sama seperti sebelumnya (matchSheet). Security (STRIDE): tidak ada permukaan baru (id sheet internal dari transaksi yang sama). Rollback: revert commit ingest.ts/repo.ts. Validation: tes ingest (FakeRepo.finish menerima sheetMap pasangan; versi pertama {}), tes planner (alias ganda: tanpa peta null, dengan peta widget pindah), uji mutasi; repo.finish → activateVersionInTx satu baris (Prisma, diuji lewat e2e versions/mapping).

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — perubahan di worker ingest (ingest.ts mengumpulkan pasangan sheet) dan transaksi aktivasi (repo.ts finish → activateVersionInTx sheetMap); batas kepercayaan sama
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: aktivasi dijalankan worker untuk versi dataset yang sama di bawah lock baris Dataset; widget hanya milik dataset itu
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — sheetMap berisi id sheet internal yang dibuat di ingest yang sama (bukan input user); planWidget hanya memakai target yang ada di versi baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: jalur galat tidak berubah
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — widget pada rantai alias ganda tetap terpasang setelah 'Ganti semua' (sebelumnya SHEET_UNAVAILABLE); urutan: pasangan pasti lalu tebakan
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak menyentuh berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru
