---
id: T-041
title: Sediakan endpoint jendela baris sheet untuk pemilik dan editor
status: done
profile: strict
profile_pinned: true
goal: G-6
tags:
  - api
  - security
  - perf
depends_on:
  - T-037
  - T-035
  - T-016
created: "2026-10-15T02:30:55Z"
updated: "2026-10-20T06:18:25Z"
closed: "2026-10-20T06:18:25Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 8fc3abc5b918c230c91f8539e728955d372abad9
paths:
  - playwright.config.ts
  - scripts/dev-share-fixture.mjs
  - scripts/perf-grid.ts
  - src/app/api/sheets/[id]/cell/route.ts
  - src/app/api/sheets/[id]/rows/route.ts
  - src/features/query/filters.ts
  - src/features/query/grid-http.ts
  - src/features/query/grid-service.ts
  - src/features/query/grid.ts
  - src/features/query/service.ts
  - tests/e2e/grid.spec.ts
  - tests/features/query/grid.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T06:15:06Z"
      findings: 5
    - "n": 2
      by: claude-code
      at: "2026-10-20T06:15:07Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 173396
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792477030324,"service":"data-dashboard","host":"127.0.0.1","port":42581,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792477030391,"service":"data-dashboard","host":"127.0.0.1","port":43959,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792477030486,"service":"data-dashboard","host":"127.0.0.1","port":46295,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792477030597,"service":"data-dashboard","host":"127.0.0.1","port":43517,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792477037550,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792477048264,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792477048286,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792477048289,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792477048300,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  164 passed | 1 skipped (165)
            Tests  2135 passed | 10 skipped (2145)
         Start at  06:15:52
         Duration  126.62s (tests 86%, import 12%, transform 3%)

          Isolate  165 workers spawned · ~148ms startup each (spawn + environment, per file)
                   at least ~7.97s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T06:18:01Z"
    tree: d76c020d3bda566926758e46791d3828a30594b65db06944d9fa1d3181d2d923
  commits:
    - 0cb153a
    - 17d81a7
    - 18b74cc
    - 1b2b9ab
    - 23e5ae9
    - 258a139
    - 27924c4
    - 27986dc
    - 2d7b316
    - 3602b55
    - 36afc9f
    - 3bb3baa
    - 49f49a5
    - 4bd9881
    - 4eea84c
    - 5101f51
    - 56e4d6d
    - 59ec9a3
    - "6123427"
    - 62ec216
    - 69b8953
    - 6b3ee3f
    - "7187327"
    - 75cf456
    - "7824e56"
    - 7ae2840
    - 7af4484
    - "8570e80"
    - 8f8df38
    - 8fc3abc
    - 90e4e63
    - "9298e14"
    - 94bea50
    - 94d85a4
    - a019f8f
    - a03481c
    - a0e1646
    - acb27a6
    - af1994a
    - b0b99d8
    - b30aea5
    - b32d50d
    - b8e59ee
    - ba2efef
    - c1c8b0a
    - c2fd95c
    - c76c343
    - ccd0a9a
    - ce26ca5
    - ce649d0
    - cf28ad3
    - d32a8ea
    - d557c9e
    - da46e35
    - e24e070
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - fc288cb
    - fc87996
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-10-20T06:18:01Z"
    passed: true
    tree: d76c020d3bda566926758e46791d3828a30594b65db06944d9fa1d3181d2d923
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 832 packages
          End status: 379 dirs visited, 1852 inodes visited, 1 Extract calls, 179.563626ms elapsed, 179.563926ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@0.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Sediakan Route Handler baca-saja untuk penampil "Lihat data" (G-6 §3.4): `POST /api/sheets/:id/rows` (jendela
≤ 500 baris × ≤ 64 kolom, urut ≤ 3, saring ≤ 20, cari) dan `GET /api/sheets/:id/cell` (isi penuh + nilai asli
bila gagal cast + sumber), hanya untuk pemilik dataset dan editor dashboard dataset itu, terpisah dari
`/api/query`. Tanpa urut/saring memakai jendela `file_row_number` per segmen.

Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-9, Fase 2. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given pemilik/editor dan sheet aktif 10 jt baris, when POST /api/sheets/:sheetId/rows {versionId, rowStart 9.999.800, rowCount 200, cols ≤ 64} tanpa urut/saring, then 200 baris benar kembali (n, _row, cells, cut) dengan p95 server ≤ 300 ms lewat jendela file_row_number, dan hanya segmen yang beririsan yang disewa
- [x] Given viewer, pengguna asing, posisi kolom tersembunyi, atau batas dilewati (rowCount > 500, cols > 64, sort > 3, filter > 20, cari > 100 karakter/10 kolom), then 403/400 tanpa nama kolom/sheet di body; identifier hanya c<pos>/_row/_period dan nilai selalu dikirim sebagai parameter
- [x] Given versionId ≠ versi aktif, then 409 VERSION_CHANGED + activeVersionId, kecuali pemilik yang meminta versi AWAITING_CONFIRM miliknya
- [x] Given urut ≤ 3 kolom dan filter, when jendela yang sama diminta dua kali, then barisnya identik (pemutus seri _row); GET …/cell mengembalikan isi penuh ≤ 32.767 karakter, nilai raw bila cast gagal, dan sumber (file, baris asli, periode)

## Risk
- Impact: endpoint baru `src/app/api/sheets/[id]/{rows,cell}` + `src/features/query/grid*.ts`; perubahan
  bersama hanya aditif: `runOnParquet` meneruskan semua path sewa ke `work` (argumen ke-3) dan `filters.ts`
  mengekspor `columnClause`. Widget/dashboard/ekspor tidak berubah perilaku (suite unit penuh lulus).
  Proyek e2e baru `grid` disisipkan di rantai (recast-segments → grid → widgets).
- Security (STRIDE): S — sesi wajib (withUser/requireUser), Origin = APP_URL untuk POST. T — tidak ada SQL
  dari klien; body zod strict, identifier hanya c<pos>/_row/_src_row/file_row_number buatan program, semua
  nilai (cari, saringan, batas jendela, path) parameter; LIMIT/OFFSET bilangan bulat tervalidasi. R — log
  galat via withUser (userId + pesan, tanpa nilai). I — viewer/asing/sheet tak dikenal → 403 identik tanpa
  nama kolom/sheet; kolom tersembunyi → 400 pesan umum; akses dihitung per permintaan tanpa cache. D —
  rowCount ≤ 500, cols ≤ 64, batas RESULT_MAX_BYTES, timeout + slot mesin yang ada, rate limit `query`
  (aturan grid terpisah + 2 dari 4 slot = T-042). E — editor = share EDITOR pada dashboard dataset itu
  (canEditWhere); pratinjau versi non-aktif hanya pemilik + status AWAITING_CONFIRM.
- Rollback: revert commit fitur; tidak ada migrasi DB atau data baru.
- Validation: unit `tests/features/query/grid.test.ts` (26), e2e `--project=grid` (2), perf
  `scripts/perf-grid.ts` → docs/ai/perf/T-041.md, `aitk check`.

## Notes
- 403 (bukan 404 seperti konvensi umum) untuk viewer/pengguna asing disengaja: mengikuti rencana §3.4 dan
  AC P-9 #2; sheet tak dikenal juga 403 identik sehingga keberadaan tidak bocor.
- Review M1/M2: GET …/cell memilih satu segmen dari rentang rowBase (≤ 1 file typed disewa); manifest
  dengan rentang `_row` bertumpuk (mis. dua segmen legacy) ditolak QUERY_FAILED (uji regresi).
- Asumsi (keputusan standar): "editor" sheet = pengguna dengan share EDITOR di salah satu dashboard dataset
  itu (kontrak T-016 per dashboard; tidak ada peran per dataset). Viewer dan pengguna asing mendapat 403
  yang sama (AC2) — sheet yang tidak ada juga 403 agar keberadaan tidak bocor.
- Status AWAITING_CONFIRM belum ada di enum (datang dengan unggahan periode, Bagian B): pengecualian
  pratinjau pemilik dipasang lewat `PREVIEW_STATUSES` dan diuji dengan repo palsu; saat ini tidak ada
  versi non-aktif yang lolos.
- `_period` dan `period` belum ada (Bagian B): body hanya menerima `period: []`, sumber sel `period: null`.
- `GET …/cell` memakai `row` = `_row` (identitas baris stabil, bukan nomor tampil). Nilai raw dibaca dari
  raw.parquet segmen (peta kolom T-gcn8) hanya bila typed NULL — raw ikut diunduh ke cache lokal saat
  pertama dibuka (perlu diamati di T-043/T-045 untuk file besar).
- Jalur 2 (urut/saring) dan file typed lama tanpa `dataRows` memakai late materialization atas seluruh
  sumber; count belum di-cache dan aturan rate/slot grid terpisah menyusul di T-042 (P-10).
- Perf AC1 diukur di container cloud 4 vCPU/16 GB (bukan VM T-023): p95 35 ms di rowStart 9.999.800,
  1 segmen disewa (docs/ai/perf/T-041.md).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: body/query klien → zod → planGrid (skema server) → SQL buatan program; Route Handler terpisah dari /api/query.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; memakai requireUser yang ada.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi; requireUser memeriksa sessionVersion seperti route lain.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Diverifikasi: pemilik dataset atau share EDITOR dashboard dataset, dicek server per permintaan; viewer/asing/sheet tak dikenal 403 (unit + e2e grid).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Diverifikasi: zod strict, posisi kolom dicocokkan dengan skema (tersembunyi ditolak), nilai lewat parameter binding (uji SQL injection di grid.test.ts).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak menyimpan data atau kunci.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Diverifikasi: galat tak terduga 503 tanpa detail (withUser), body penolakan tanpa nama kolom/sheet.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Diverifikasi: respons no-store; blok baris tidak di-cache server; hanya kolom terlihat yang dikirim.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Diverifikasi: tanpa dependensi baru; aitk audit hijau.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Diverifikasi: versi diperiksa (409 VERSION_CHANGED) sehingga baris dua versi tidak tercampur; batas baris/kolom/urut/saring/cari ditegakkan.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Diverifikasi: path parquet hanya dari manifest DB lewat cache sewa (sandbox allowed_directories); tidak ada unggahan.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Diverifikasi: skema input/output tetap, Origin dicek untuk POST, rate limit per user (aturan query; aturan grid di T-042).
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi/header baru.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T06:18:01Z (173396 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 0cb153a, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 2d7b316, 3602b55, 36afc9f, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 56e4d6d, 59ec9a3, 6123427, 62ec216, 69b8953, 6b3ee3f, 7187327, 75cf456, 7824e56, 7ae2840, 7af4484, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9298e14, 94bea50, 94d85a4, a019f8f, a03481c, a0e1646, acb27a6, af1994a, b0b99d8, b30aea5, b32d50d, b8e59ee, ba2efef, c1c8b0a, c2fd95c, c76c343, ccd0a9a, ce26ca5, ce649d0, cf28ad3, d32a8ea, d557c9e, da46e35, e24e070, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-code: 0 findings
