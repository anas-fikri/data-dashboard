---
id: T-c6z4
title: Tampilkan pratinjau tabel pivot penuh di editor pivot tersimpan
status: done
profile: strict
goal: G-7
tags:
  - ui
  - security
created: "2026-10-21T18:24:32Z"
updated: "2026-10-22T06:24:25Z"
closed: "2026-10-22T06:24:25Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: c04ac2b8909056f6ba6c29568877fe13b425d514
paths:
  - content/panduan/06-susun-dashboard.md
  - content/panduan/13-widget-pivot.md
  - docs/catatan-kerja-claude.md
  - src/app/api/query/route.ts
  - src/components/dashboards/auto-title.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/pivot-config-model.ts
  - src/components/dashboards/smart-defaults.ts
  - src/components/dashboards/use-dashboard-editor.ts
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-panel.tsx
  - src/components/saved-pivots/saved-pivot-editor.tsx
  - src/components/saved-pivots/saved-pivot-preview.tsx
  - src/components/widgets/widget-query.ts
  - src/features/dashboards/service.ts
  - src/features/query/http.ts
  - src/features/query/service.ts
  - src/features/query/widget.ts
  - tests/components/pivot-ui.test.ts
  - tests/components/smart-defaults.test.ts
  - tests/e2e/pivot.spec.ts
  - tests/e2e/saved-pivot-widgets.spec.ts
  - tests/e2e/widgets.spec.ts
  - tests/features/dashboards/roles.test.ts
  - tests/features/query/bound-widgets.test.ts
  - tests/features/query/query-http.test.ts
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
    exit_code: 0
    duration_ms: 200259
    summary: |-
      …olak NAS"}
      {"level":40,"time":1792649955482,"service":"data-dashboard","host":"127.0.0.1","port":36235,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792649971363,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792649971385,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792649971390,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792649971406,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792649987350,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792649987365,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  224 passed | 3 skipped (227)
            Tests  3024 passed | 29 skipped (3053)
         Start at  06:17:55
         Duration  134.38s (tests 83%, import 14%, transform 3%)

          Isolate  227 workers spawned · ~113ms startup each (spawn + environment, per file)
                   at least ~8.42s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T06:20:11Z"
    tree: 367099cced463996bcee5740ab94170072ed06f0ae6ac3502f320bbe263c944b
  commits:
    - 0a6567a
    - 14b219f
    - 21e6bd7
    - 3a16a5e
    - 3b83c4e
    - 3d38afd
    - 3f0008e
    - 43e0d50
    - 460a7f3
    - 4d95c0d
    - 594ca78
    - 5cf7246
    - 62dfa2b
    - 7062ff7
    - "7266741"
    - 7f14236
    - 829d5ba
    - 95344b2
    - 974c1b6
    - 9b36c7d
    - ad5caec
    - bb53812
    - bb7eb29
    - bf962e6
    - c04ac2b
    - c7bb4f1
    - cb1f89f
    - ccb8465
    - cff3c8d
    - d16ff25
    - d3820d7
    - d55a8d0
    - e0ec8e7
    - e435538
    - e69d344
    - eb97953
    - ee2a976
    - ef4acc2
    - f5805f9
    - f890322
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-10-22T06:20:18Z"
    passed: true
    tree: 367099cced463996bcee5740ab94170072ed06f0ae6ac3502f320bbe263c944b
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 346 dirs visited, 2027 inodes visited, 1 Extract calls, 47.412725ms elapsed, 47.412893ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.3.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
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

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-22T06:20:11Z (200259 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 0a6567a, 14b219f, 21e6bd7, 3a16a5e, 3b83c4e, 3d38afd, 3f0008e, 43e0d50, 460a7f3, 4d95c0d, 594ca78, 5cf7246, 62dfa2b, 7062ff7, 7266741, 7f14236, 829d5ba, 95344b2, 974c1b6, 9b36c7d, ad5caec, bb53812, bb7eb29, bf962e6, c04ac2b, c7bb4f1, cb1f89f, ccb8465, cff3c8d, d16ff25, d3820d7, d55a8d0, e0ec8e7, e435538, e69d344, eb97953, ee2a976, ef4acc2, f5805f9, f890322
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-code: 0 findings
