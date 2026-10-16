---
id: T-065
title: 'Ingest XLSX: tanggal 1 Jan–28 Feb 1900 terbaca mundur satu hari (bug tahun kabisat 1900 Excel)'
status: in_review
profile: standard
goal: G-3
tags:
  - bug
created: "2026-10-15T19:47:05Z"
updated: "2026-10-16T16:13:23Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: a01a9ef33c04775e308d26e0eb6222594e049296
review:
  passes:
    - "n": 1
      by: frontend-expert-test-engineer
      at: "2026-10-16T16:03:58Z"
      findings: 1
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-16T16:03:58Z"
      findings: 1
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 39959
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

      {"level":40,"time":1792167182923,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792167182946,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792167182956,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  117 passed (117)
            Tests  1684 passed (1684)
         Start at  23:12:55
         Duration  26.28s (tests 71%, import 20%, transform 8%, worker 1%)

          Isolate  117 workers spawned · ~139ms startup each (spawn + environment, per file)
                   at least ~1.67s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T16:13:23Z"
    tree: e5612923d015f843925014d7a94965b1a9811a2c85de4fd6b263dc5233fbf5d4
---

## Objective
Ditemukan saat review T-017 INT-2: src/lib/xlsx/parser.ts memakai epoch 1899-12-30 tanpa koreksi bug tahun kabisat 1900 Excel, sedangkan writer ekspor T-017 sudah mengoreksinya. Dampak praktis kecil (data pengiriman jarang berisi Jan–Feb 1900), tapi impor harus cocok dengan Excel. Perbaiki di parser + regression test; jangan ubah perilaku ekspor.

## Acceptance criteria
- [ ] Given file XLSX dari Excel berisi tanggal 1900-01-01, 1900-02-28, 1900-03-01 dan 2024-01-02 (serial 1, 59, 61, 45293), when diingest, then nilai tanggal di dataset sama persis dengan yang tampil di Excel (bukan mundur satu hari untuk serial < 61)
- [ ] Given serial 60 (29 Feb 1900 fiktif Excel), when diingest, then tidak menjadi tanggal salah diam-diam (ditandai gagal cast atau dipetakan jelas) dan tanggal 1900-03-01 ke atas tidak berubah

## Risk
Impact: hanya kolom date/timestamp dari sumber xlsx untuk raw ISO 1899-12-31 … 1900-02-28 (seri Excel 1–60); parser tetap linier sehingga durasi (termasuk durasi bergaya tanggal =B2-A2) tidak berubah; seri ≥ 61, CSV, format serial koreksi user, dan sistem 1904 tidak berubah; data lama baru terkoreksi saat ingest ulang/koreksi skema. Security (STRIDE): tidak ada permukaan baru — pembandingan teks raw di SQL memakai literal konstan. Rollback: revert commit infer.ts/typed.ts. Validation: tes ingest DuckDB sungguhan — seri 1/59/61/45293 = tampilan Excel, seri 60 = 1 gagal cast (NULL, castFailCount 1), durasi bergaya tanggal 0,25/1,5/59,5/60,5 hari persis; tes tanggal gagal bila koreksi dimatikan (uji mutasi); review integritas INT-1 (durasi) ditangani dengan memindahkan koreksi dari parser ke cast kolom tanggal.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — perubahan hanya di cast kolom tanggal ingest (src/features/ingest/infer.ts excel1900/fict1900 + okCount/typedParts menerima sumber; typed.ts meneruskan input.source); parser xlsx tidak berubah; batas kepercayaan sama (file unggahan diproses worker)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak menyentuh otorisasi; ingest tetap per versi milik dataset
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — pembandingan raw memakai literal SQL konstan ('1899-12-31', '1900-02-28', '1900-03'), tanpa nilai pengguna di teks SQL; seri 60 → NULL lewat CASE (bukan galat), dihitung castFailCount lewat Profile.fict dengan predikat yang sama
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat/log baru; seri 60 tercatat sebagai gagal cast kolom (ditampilkan di skema), bukan galat
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — nilai tanggal impor kini sama dengan tampilan Excel (sebelumnya mundur 1 hari untuk Jan–Feb 1900) dan konsisten dengan ekspor XLSX T-017 (excelSerial); durasi tetap persis; tanggal fiktif tidak lagi diam-diam menjadi tanggal salah
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — batas parser (ukuran, sel, format, sheet) tidak berubah; tidak ada path/URL baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru
