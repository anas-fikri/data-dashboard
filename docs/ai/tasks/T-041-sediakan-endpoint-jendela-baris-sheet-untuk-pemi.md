---
id: T-041
title: Sediakan endpoint jendela baris sheet untuk pemilik dan editor
status: in_progress
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
updated: "2026-10-20T06:09:41Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 8fc3abc5b918c230c91f8539e728955d372abad9
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 174316
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792476530088,"service":"data-dashboard","host":"127.0.0.1","port":43471,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792476530148,"service":"data-dashboard","host":"127.0.0.1","port":36321,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792476530250,"service":"data-dashboard","host":"127.0.0.1","port":42127,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792476530372,"service":"data-dashboard","host":"127.0.0.1","port":43189,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792476538473,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792476546833,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792476546856,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792476546861,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792476546877,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  164 passed | 1 skipped (165)
            Tests  2133 passed | 10 skipped (2143)
         Start at  06:07:34
         Duration  125.30s (tests 85%, import 12%, transform 3%)

          Isolate  165 workers spawned · ~148ms startup each (spawn + environment, per file)
                   at least ~8.00s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T06:09:41Z"
    tree: d5463c0506654bc9444ab4ff9b2eb9e080da3918d1bee309bcc9252094964884
  audit:
    at: "2026-10-20T06:06:22Z"
    passed: true
    tree: d5463c0506654bc9444ab4ff9b2eb9e080da3918d1bee309bcc9252094964884
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 832 packages
          End status: 352 dirs visited, 1776 inodes visited, 1 Extract calls, 193.399935ms elapsed, 193.400175ms wall time
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
