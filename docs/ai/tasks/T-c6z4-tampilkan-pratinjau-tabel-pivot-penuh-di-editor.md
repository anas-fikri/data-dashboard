---
id: T-c6z4
title: Tampilkan pratinjau tabel pivot penuh di editor pivot tersimpan
status: in_review
profile: standard
goal: G-7
tags:
  - ui
  - security
created: "2026-10-21T18:24:32Z"
updated: "2026-10-22T03:19:39Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: c04ac2b8909056f6ba6c29568877fe13b425d514
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T03:11:23Z"
      findings: 3
    - "n": 2
      by: claude-code
      at: "2026-10-22T03:11:23Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 1
    duration_ms: 494697
    summary: |-
      …1","port":42197,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792638824761,"service":"data-dashboard","host":"127.0.0.1","port":34309,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792638837919,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792638843444,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792638843466,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792638843473,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792638843490,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3031 passed | 10 skipped (3041)
         Start at  03:12:24
         Duration  133.20s (tests 83%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~112ms startup each (spawn + environment, per file)
                   at least ~8.34s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      npm notice This endpoint is being retired. Use the bulk advisory endpoint instead. See the following docs for more info: https://api-docs.npmjs.com/#tag/Audit
      npm warn audit 400 Bad Request - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick - Bad Request
      {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid package tree, run  npm install  to rebuild your package-lock.json'
      }
      npm error audit endpoint returned an error
      npm error A complete log of this run can be found in: /root/.npm/_logs/2026-10-22T03_14_38_224Z-debug-0.log
    at: "2026-10-22T03:19:39Z"
    tree: 7027007aef07d1fc380d0547adcee845efae418cb1b179e3c3ac1d0c7470f043
  check_failures: 2
---

## Objective
T-074 memakai pratinjau ringkas di editor pivot tersimpan (kalimat bentuk tabel, nilai contoh field terhitung, nilai Saring) karena /api/query belum punya mode pivot untuk pemilik tanpa widget. Tambahkan mode query pivot pemilik { datasetId, pivot } (strict, D6 tetap: pemilik dataset saja, spec divalidasi seperti simpan widget) dan tampilkan tabel pivot pratinjau (PivotTableMarkup) di editor dengan batas sel yang sama.

## Acceptance criteria
- [x] Given pemilik di editor pivot tersimpan, when mengubah baris/nilai, then tabel pratinjau memuat ulang dengan nilai yang sama dengan widget terikat
- [x] Given editor/viewer atau dataset lain, when memanggil mode pivot pemilik, then 404 NOT_FOUND

## Risk
- Impact: /api/query mendapat mode keempat `{ datasetId, pivot }` (dipilih dari kunci `pivot`, setelah widgetId/dashboardId); mode lama tidak berubah (urutan pemilihan sama, body strict). `runPivotPreview` memakai jalur widget pivot mandiri (resolveWidget → widgetPlan → runPivotPlan): batas sel 24.000/200×40, cache hasil, slot DuckDB per user + global, rate limit `query:user`. UI: editor pivot tersimpan dua kolom (lg) / tabel di bawah pengaturan (<lg); query pratinjau ditunda 400 ms dan dibatalkan saat definisi berubah. `fetchWidget` menerima body pratinjau (tipe saja).
- Security (STRIDE): S — sesi requireUser + Origin = APP_URL (CSRF) seperti mode lain. T — spec dari klien divalidasi `pivotSpecSchema` (zod strict, sama dengan simpan) lalu `widgetPlan` terhadap skema aktif; SQL hanya dari rencana (identifier c<pos>, nilai binding). R — tidak menulis apa pun (baca saja); log galat tanpa isi spec (mode + userId). I — pemilik dataset saja (`ownedDataset`), editor/viewer/orang lain/dataset lain → 404 NOT_FOUND; sheet dataset lain/versi lama → 404 tanpa pemetaan riwayat; kolom tersembunyi → COLUMN_UNAVAILABLE (pemilik memang melihat skemanya). D — debounce + abort di klien, batas sel/hasil/timeout/slot di server sama dengan widget, rate limit 600/menit. E — tidak ada jalur editor/viewer yang menerima spec (D6 tetap).
- Rollback: revert commit T-c6z4 (tanpa migrasi/konfigurasi); editor kembali ke kalimat ringkasan saja.
- Validation: unit `bound-widgets.test` (pratinjau = widget pivot terikat, ubah nilai → nilai Biaya, cache; non-pemilik/dataset/sheet lain NOT_FOUND tanpa DuckDB; spec salah INVALID sebelum otorisasi; kolom tak ada COLUMN_UNAVAILABLE) dan `query-http.test` (404/400/409 per mode, dashboardId+pivot → 400); e2e `saved-pivot-widgets.spec.ts` (project widgets) 10/10.

## Notes
- Mode baru `/api/query { datasetId, pivot }` (src/features/query/service.ts `runPivotPreview`, widget.ts `pivotPreviewBodySchema`, http.ts). Tidak ada mode pratinjau pivot yang sudah ada sebelumnya (query bebas `{ datasetId, spec }` hanya agregat datar), jadi mode ini dibuat dengan jalur eksekusi widget pivot mandiri.
- UI: src/components/saved-pivots/saved-pivot-preview.tsx (PivotView → PivotTableMarkup yang sama dengan kartu), dipasang di saved-pivot-editor.tsx. Kalimat ringkasan tetap. Keadaan: belum lengkap (definisi ditandai galat), memuat (kerangka / tabel lama redup + garis progres), galat (pesan server + Coba lagi untuk gangguan sementara), kosong ("Tidak ada data untuk ditampilkan" dari PivotView).
- Asumsi: pratinjau tidak memakai menu saring pembaca/filter silang (hanya tampilan definisi); label baris bukan tombol.
- Plugin frontend-expert tidak tersedia di sesi cloud ini: pola UI mengikuti komponen yang ada (token CSS, ikon Tabler 20/1.5, wilayah gulir fokus-able dari PivotView); dicek visual 1440 px dan 360 px terang/gelap lewat tangkapan layar e2e.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: browser editor pivot tersimpan → /api/query (Origin, sesi, rate limit, body strict) → ownedDataset (pemilik) → sheet versi aktif → rencana widget pivot server → DuckDB; definisi tidak pernah lewat jalur editor/viewer dashboard.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak mengubah autentikasi (requireUser('action') di route lama).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak mengubah sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: hanya pemilik dataset (repo.ownedDataset); editor/viewer/orang asing/dataset lain/sheet dataset lain → 404 NOT_FOUND tanpa DuckDB (bound-widgets.test T-c6z4 AC2, query-http.test, e2e AC4 editor+viewer 404).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: body zod strict { datasetId: cuid, pivot: pivotSpecSchema } (skema yang sama dengan simpan), lalu widgetPlan terhadap skema aktif; kunci asing/`sql` → 400; SQL dari rencana (identifier c<pos>, nilai binding); keluaran dirender React (escape).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data tersimpan baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: pesan Indonesia dari kode (NOT_FOUND/INVALID/COLUMN_UNAVAILABLE/…); galat tak terduga → 500 tanpa detail, log hanya userId+mode+pesan error (tanpa spec).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: tidak ada data pribadi baru; hasil masuk cache hasil yang sama dengan widget pivot mandiri (kunci dataset/versi/sheet/revisi skema/spec), hanya pemilik yang bisa memicunya.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada komunikasi eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru; klien hanya memanggil /api/query same-origin.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: baca saja (tidak ada tulis/race); debounce 400 ms + abort di klien; batas sel 24.000, hasil 5 MB, timeout + cache negatif, slot DuckDB per user/global sama dengan widget.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak ada unggahan/file baru; parquet dipilih server dari sheet versi aktif.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — diverifikasi: Origin = APP_URL, body ≤ 64 KB JSON strict, rate limit query:user yang sama (query-http.test), { dashboardId, pivot } → 400.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — tidak mengubah konfigurasi.
