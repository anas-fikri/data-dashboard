---
id: T-073
title: Ikat widget ke pivot tersimpan dengan query aman D6 dan invalidasi cache
status: done
profile: strict
profile_pinned: true
goal: G-7
tags:
  - security
  - query
depends_on:
  - T-072
created: "2026-10-21T10:24:14Z"
updated: "2026-10-21T17:21:09Z"
closed: "2026-10-21T17:21:09Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: e2c6cf110cb9a71a964bf7b37a669a03a8678a5f
paths:
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - prisma/migrations/20261021170000_t072_saved_pivot/migration.sql
  - prisma/schema.prisma
  - scripts/dev-saved-pivot-fixture.mjs
  - src/components/dashboards/config-saves.ts
  - src/components/dashboards/dashboard-api.ts
  - src/components/dashboards/use-dashboard-editor.ts
  - src/components/dashboards/widget-card.tsx
  - src/features/audit/service.ts
  - src/features/auth/rate-limit.ts
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - src/features/exports/job.ts
  - src/features/exports/schema.ts
  - src/features/exports/service.ts
  - src/features/query/runtime.ts
  - src/features/query/service.ts
  - src/features/query/widget.ts
  - src/features/saved-pivots/actions.ts
  - src/features/saved-pivots/service.ts
  - src/features/versions/activation.ts
  - src/features/widgets/bound.ts
  - tests/e2e/bound-widgets.spec.ts
  - tests/features/dashboards/dashboards.test.ts
  - tests/features/dashboards/http.test.ts
  - tests/features/exports/bound-export.test.ts
  - tests/features/query/__snapshots__/bound-legacy.test.ts.snap
  - tests/features/query/bound-legacy.test.ts
  - tests/features/query/bound-widgets.test.ts
  - tests/features/query/sharing-repo.test.ts
  - tests/features/saved-pivots/actions.test.ts
  - tests/features/saved-pivots/binding.db.test.ts
  - tests/features/saved-pivots/service.db.test.ts
  - tests/features/versions/activation.test.ts
  - tests/features/widgets/bound.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T17:17:04Z"
      findings: 5
    - "n": 2
      by: claude-code
      at: "2026-10-21T17:17:05Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 210846
    summary: |-
      …asetId":"t072mvidnkhxds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792603190528,"service":"data-dashboard","host":"127.0.0.1","port":42497,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792603190588,"service":"data-dashboard","host":"127.0.0.1","port":37019,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792603190691,"service":"data-dashboard","host":"127.0.0.1","port":42793,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792603190800,"service":"data-dashboard","host":"127.0.0.1","port":40633,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792603199394,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792603214985,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792603215008,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792603215013,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792603215023,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  221 passed | 1 skipped (222)
            Tests  2990 passed | 10 skipped (3000)
         Start at  17:18:08
         Duration  146.05s (tests 83%, import 14%, transform 3%)

          Isolate  222 workers spawned · ~157ms startup each (spawn + environment, per file)
                   at least ~11.50s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T17:20:36Z"
    tree: eda3f139bf1b7f8ec34f56447ace9a02973e8977132378c133ef6bc2110f7402
  commits:
    - 07b7bf2
    - 14e93e4
    - 17cb5cc
    - 20985af
    - 3f15210
    - 4115c8d
    - 468e913
    - 52486eb
    - 5f3cb82
    - 60920fa
    - 61111df
    - 693edf2
    - 6f54377
    - 764bbce
    - 7ccff4c
    - 864037d
    - 8ce72cf
    - a4869d3
    - a80b5ae
    - a821c13
    - b5206c2
    - c4a56e5
    - d13f79e
    - d23d4b2
    - d76daf2
    - e2c6cf1
    - eb70260
    - ec22d22
    - f1bd517
    - f9bd2d5
  acceptance:
    total: 5
    done: 5
  audit:
    at: "2026-10-21T17:20:37Z"
    passed: true
    tree: eda3f139bf1b7f8ec34f56447ace9a02973e8977132378c133ef6bc2110f7402
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 524 dirs visited, 4897 inodes visited, 1 Extract calls, 280.257403ms elapsed, 280.257715ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.2.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Widget pivot/bar/line/pie/KPI/tabel bisa memakai pivot tersimpan sebagai sumber: spec widget berisi tampilan saja, server menyusun spec efektif. Viewer tetap {widgetId, dashboardFilters} (D6); cache hasil dan sumber filter memuat revisi pivot tersimpan. Rencana G-7 §4.3, §5.

## Acceptance criteria
- [x] Given widget pivot, bar, line, pie, KPI, dan tabel yang merujuk pivot tersimpan yang sama, when pemilik mengubah nilai/field terhitung di pivot tersimpan, then keenam widget menampilkan definisi baru pada muat berikutnya tanpa menunggu TTL (kunci cache hasil + filterSourcesFor memuat SavedPivot.revision), dan widget lain tidak berubah
- [x] Given viewer dashboard bersama, when POST /api/query dengan {widgetId, dashboardFilters} untuk widget terikat, then hasil benar; given body memuat savedPivotId, spec, atau field lain, then 400 INVALID; given widgetId dari dashboard lain atau pivot tersimpan dataset lain, then 404 NOT_FOUND; endpoint definisi pivot tersimpan tidak bisa dipanggil viewer (NOT_FOUND)
- [x] Given kolom cross-filter yang diizinkan dashboard, then diturunkan dari spec efektif (baris/kolom pivot tersimpan + tampilan widget, crossFilter === true) sehingga viewer tidak bisa memfilter kolom yang tidak tampil di widget mana pun; uji D6 regresi (tests/features/query) hijau
- [x] Given pivot tersimpan berisi MISSING_COLUMN setelah aktivasi versi, then setiap widget terikat menampilkan pesan kolom hilang per widget (bukan error dashboard) dan ekspor/PDF widget itu melewatinya dengan catatan; given tampilan widget tidak cocok sumber (mis. grafik memilih nilai ke-6 yang sudah dihapus), then pesan 'Pilih ulang nilai di pengaturan widget'
- [x] Given ekspor CSV/XLSX widget terikat dan PDF dashboard, then memakai spec efektif yang sama dengan tampilan (job ekspor membaca revisi saat job dibuat) dan AuditLog ekspor tetap tercatat; checklist ASVS V4 dan review keamanan tanpa Critical/High

## Risk
- Impact: jalur query widget (/api/query), halaman dashboard (getDashboard → spec efektif), sumber filter silang (D6), ekspor CSV/XLSX + PDF, PATCH widget (ikat/lepas), aktivasi versi (widget terikat dilewati). Widget mandiri tidak berubah: SQL, parameter, dan kunci cache hasil byte-identik dengan e2c6cf1 (snapshot `tests/features/query/bound-legacy.test.ts`, 13 kasus pivot/grafik/KPI/tabel/filter dashboard/pivotValues); kunci sumber filter sama persis bila dashboard tanpa widget terikat. Tanpa migrasi (kolom `Widget.savedPivotId` sudah ada dari T-072).
- Security (STRIDE): Spoofing — tidak ada jalur baru tanpa sesi (requireUser/withUser lama). Tampering — viewer tetap `{widgetId, dashboardFilters, …}` strict; `savedPivotId`/`spec`/field lain → 400 INVALID; ikat hanya pemilik/editor dashboard di bawah lock dashboard + `FOR KEY SHARE` baris pivot tersimpan, CAS versi widget dan revisi pivot tersimpan. Repudiation — perubahan pivot tersimpan sudah ber-AuditLog (T-072); ekspor tetap AuditLog lama. Information disclosure — pivot tersimpan wajib `datasetId` = dataset dashboard (dicek service/repo; lain → NOT_FOUND tanpa versi widget, cache, atau DuckDB); rincian sumber (id, nama, tampilan) tidak dikirim ke viewer; kolom filter silang dari spec efektif (filter silang pivot tersimpan tidak diwarisi), jadi viewer tidak bisa memfilter kolom yang tidak tampil; cache hasil memuat id+revisi → edit tidak meninggalkan hasil basi; pesan COLUMN_UNAVAILABLE umum untuk viewer. Catatan: viewer menerima spec EFEKTIF widget terikat di halaman (sama dengan widget mandiri hari ini: kartu butuh spec untuk menggambar), bukan endpoint definisi pivot tersimpan (tetap NOT_FOUND). DoS — tidak ada bentuk query baru; batas pivot/grafik sama (parseWidgetConfig). Elevation — editor hanya memilih sumber, tidak mengubah pivot tersimpan (T-072).
- Rollback: kembalikan image sebelumnya (tanpa migrasi). Widget yang sudah terikat menyimpan spec tampilan saja → di kode lama kartu "belum diatur" (spec tidak lolos parseWidgetConfig) dan aktivasi melewatinya; lepas dulu (`PATCH {detach:true}`) sebelum rollback bila perlu, atau ikat ulang setelah upgrade lagi. Data tidak hilang.
- Validation: unit `tests/features/widgets/bound.test.ts` (9), `tests/features/query/bound-widgets.test.ts` (14, DuckDB sungguhan: 6 widget berubah serempak, revisi di kunci, Saring, filter dashboard, D6, kolom hilang, tampilan basi), `bound-legacy.test.ts` (13 snapshot), `tests/features/exports/bound-export.test.ts` (5), integrasi PostgreSQL `tests/features/saved-pivots/binding.db.test.ts` (9), route `tests/features/dashboards/http.test.ts`, repo `sharing-repo.test.ts`, aktivasi; e2e `tests/e2e/bound-widgets.spec.ts` (project widgets, 3/3); `aitk check` hijau (2989 uji).

## Notes
- Implementasi: `src/features/widgets/bound.ts` (skema tampilan + `effectiveConfig` murni), `query/service.ts` (`configOf`/`boundSourceOk`, Saring sumber grafik/KPI → klausa dashboard, `src` di kunci cache), `query/widget.ts` (`widgetPlan(..., {filters})` untuk grafik/KPI), `query/runtime.ts` (pivot tersimpan dibaca bersama widget + `sourceStamp` untuk kunci sumber filter), `dashboards/service.ts` (`withSources` di getDashboard/filterSourcesFor/filterOverlapFor, `configureWidget(..., savedPivotId)`, `detachWidget`), `dashboards/http.ts` (PATCH `{type,spec,savedPivotId}` / `{detach:true}`), `exports` (`sourceRevision`), `versions/activation.ts` (widget terikat dilewati), kartu `sourceError`. Amandemen ADR-0009 (T-073).
- Asumsi (keputusan standar, dicatat di ADR): tabel terikat = pivot rata (bukan tabel berhalaman 100); grafik/KPI memakai satu nilai (Q6) beserta cara tampilnya bila diizinkan jenis grafik, KPI tanpa cara tampil; Top N per baris pivot tersimpan tidak dipakai grafik (grafik punya N teratas sendiri); lepas dari sumber pada grafik/KPI membuang Saring (`filtersDropped: true` agar UI T-074 memperingatkan); ekspor dikunci ke revisi saat diminta (berubah → VERSION_CHANGED).
- Untuk T-074: UI ikat/lepas memakai PATCH di atas; WidgetView membawa `source` (pemilik/editor) dan `sourceError`. Panel lama menyimpan spec efektif sebagai widget mandiri (melepas ikatan) dan "urungkan hapus" widget terikat memulihkannya sebagai salinan mandiri — perlu ditangani UI T-074. Kartu belum mendeteksi edit pivot tersimpan di tengah sesi (berlaku pada muat berikutnya, sesuai AC1).
- Review keamanan orkestrator `e2c6cf1..07b7bf2`: 0 Critical/High. Low diperbaiki: L1 ekspor dikunci ke `sourceId` + `sourceRevision` (ikat ulang ke pivot lain berrevisi sama → VERSION_CHANGED, diuji); L2 body PATCH widget tertutup (judul saja / atur-ikat type+spec[+savedPivotId] / detach saja; campuran/sebagian → 400, diuji); L3 pesan sumber tidak cocok untuk viewer umum tanpa menyebut pivot tersimpan (halaman + query, diuji); L5 spec efektif widget terikat tidak dipetakan lewat riwayat di getDashboard, sama dengan jalur query (uji PostgreSQL). L4 (panel/urungkan hapus) → T-074.
- e2e menyiapkan pivot tersimpan lewat `scripts/dev-saved-pivot-fixture.mjs` (dev saja) sampai UI T-074 ada.
- `aitk impact` menandai `src/features/exports/job.ts` tanpa uji — sebenarnya dicakup `tests/features/exports/job.test.ts` dan `bound-export.test.ts` (resolusi impor alias).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: viewer → /api/query (body strict) → repo.widget (akses dashboard + pivot tersimpan sedataset) → spec efektif server; definisi pivot tersimpan tidak lewat jalur viewer.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi (requireUser/withUser lama).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: ikat hanya OWNER/EDITOR dashboard (viewer 403, orang lain 404), pivot tersimpan dataset lain → NOT_FOUND saat ikat dan saat query/ekspor (binding.db.test, bound-widgets.test, bound-export.test); viewer tidak menerima rincian sumber; endpoint definisi viewer NOT_FOUND.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: tampilan zod strict per jenis, spec efektif lewat parseWidgetConfig + checkConfig terhadap data aktif; body viewer strict (savedPivotId/spec → 400); SQL hanya dari rencana yang sama (identifier c<pos>, nilai parameter).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: pesan per widget berbahasa Indonesia tanpa detail internal; COLUMN_UNAVAILABLE umum untuk viewer; rujukan lintas dataset dijawab sama dengan widget tidak ada.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: tidak ada data pribadi baru; cache hasil per revisi (tidak ada hasil basi lintas edit).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru; skrip fixture dev menolak NODE_ENV=production.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: ikat di bawah lock dashboard + FOR KEY SHARE pivot tersimpan (hapus bersamaan → IN_USE), CAS versi widget + revisi pivot tersimpan (STALE), lepas dengan CAS; ekspor dikunci revisi saat diminta.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/file baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — diverifikasi: PATCH widget menerima bentuk tertutup ({detach:true} tidak boleh dicampur → 400), rate limit dashboardEdit lama berlaku; body /api/query dan /api/exports tetap strict.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak mengubah konfigurasi.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T17:20:36Z (210846 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 07b7bf2, 14e93e4, 17cb5cc, 20985af, 3f15210, 4115c8d, 468e913, 52486eb, 5f3cb82, 60920fa, 61111df, 693edf2, 6f54377, 764bbce, 7ccff4c, 864037d, 8ce72cf, a4869d3, a80b5ae, a821c13, b5206c2, c4a56e5, d13f79e, d23d4b2, d76daf2, e2c6cf1, eb70260, ec22d22, f1bd517, f9bd2d5
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-code: 0 findings
