---
id: T-075
title: Uji e2e dan performa pivot lanjutan, ekspor PDF, dan ponsel
status: blocked
profile: strict
profile_pinned: true
goal: G-7
tags:
  - test
  - perf
depends_on:
  - T-074
created: "2026-10-21T10:24:16Z"
updated: "2026-10-21T20:16:34Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: bb5381247e03ac71708efc923797f0bc0297bca6
paths:
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - playwright.config.ts
  - prisma/migrations/20261021170000_t072_saved_pivot/migration.sql
  - prisma/schema.prisma
  - scripts/dev-saved-pivot-fixture.mjs
  - scripts/perf-pivot-advanced.ts
  - scripts/perf.mjs
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/(app)/datasets/[id]/pivot-tersimpan/[pivotId]/page.tsx
  - src/app/(app)/datasets/[id]/pivot-tersimpan/baru/page.tsx
  - src/components/dashboards/bound-config-model.ts
  - src/components/dashboards/bound-config.tsx
  - src/components/dashboards/calc-editor.tsx
  - src/components/dashboards/config-saves.ts
  - src/components/dashboards/dashboard-api.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/pivot-saved-filters.tsx
  - src/components/dashboards/query-scope.ts
  - src/components/dashboards/use-dashboard-editor.ts
  - src/components/dashboards/widget-card.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/dashboards/widget-source.tsx
  - src/components/saved-pivots/saved-pivot-editor.tsx
  - src/components/saved-pivots/saved-pivot-list.tsx
  - src/components/saved-pivots/saved-pivot-page.tsx
  - src/components/ui/page-header.tsx
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
  - tests/components/bound-config.test.ts
  - tests/components/calc-editor.test.ts
  - tests/components/page-header.test.ts
  - tests/components/pivot-filters.test.ts
  - tests/components/pivot-ui.test.ts
  - tests/components/saved-pivot-ui.test.ts
  - tests/e2e/bound-widgets.spec.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/pivot-lanjutan.spec.ts
  - tests/e2e/saved-pivot-widgets.spec.ts
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
      at: "2026-10-21T20:11:53Z"
      findings: 3
    - "n": 2
      by: claude-code
      at: "2026-10-21T20:11:55Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 253371
    summary: |-
      …asetId":"t072mvijxk3gds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792613733408,"service":"data-dashboard","host":"127.0.0.1","port":41219,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792613733459,"service":"data-dashboard","host":"127.0.0.1","port":38457,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792613733564,"service":"data-dashboard","host":"127.0.0.1","port":45867,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792613733664,"service":"data-dashboard","host":"127.0.0.1","port":35781,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792613742889,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792613750814,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792613750836,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792613750838,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792613750849,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  223 passed | 1 skipped (224)
            Tests  3010 passed | 10 skipped (3020)
         Start at  20:13:24
         Duration  163.81s (tests 86%, import 11%, transform 2%)

          Isolate  224 workers spawned · ~148ms startup each (spawn + environment, per file)
                   at least ~10.92s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T20:16:09Z"
    tree: d2c05f1f463ff809baa0d7a65f8ec519e9306ac33de79885654a369d916f874f
  commits:
    - 07b7bf2
    - 0a6567a
    - 14e93e4
    - 17cb5cc
    - 1ad5b22
    - 20985af
    - 3f15210
    - 4115c8d
    - 460a7f3
    - 468e913
    - 52486eb
    - 594ca78
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
    - bb53812
    - c4a56e5
    - c7bb4f1
    - ccb8465
    - d13f79e
    - d23d4b2
    - d76daf2
    - e2c6cf1
    - eb70260
    - eb97953
    - ec22d22
    - f1bd517
    - f9bd2d5
  acceptance:
    total: 4
    done: 1
  audit:
    at: "2026-10-21T20:16:09Z"
    passed: true
    tree: d2c05f1f463ff809baa0d7a65f8ec519e9306ac33de79885654a369d916f874f
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5133 inodes visited, 1 Extract calls, 271.491173ms elapsed, 271.491429ms wall time
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
Bukti menyeluruh G-7: e2e jalur kritis (pemilik membuat pivot tersimpan dengan field terhitung + Tampilkan nilai sebagai + Top N, mengikat 4 jenis widget, berbagi ke viewer, ekspor), dan perf di profil produksi. Rencana G-7 §7 fase 5.

## Acceptance criteria
- [ ] Given e2e Playwright (project baru pivot-lanjutan), when pemilik membuat pivot tersimpan 3 level × 5 nilai (2 terhitung, 1 pct_col, Top 5 + Lainnya), mengikat pivot, bar, KPI, tabel, mengubah sumber, lalu viewer membuka dashboard bersama, then keempat widget berubah serempak, viewer melihat nilai benar dan tidak bisa membuka definisi, dan suite penuh hijau sekali sebelum close
- [ ] Given npm run perf skenario pivot pada fixture 10 jt baris (profil T-023, cache hangat), then laporan docs/ai/perf/T-075.md mencatat p95 pivot 4 level × 8 nilai + Top N + field terhitung, dashboard 6 widget terikat satu sumber, dan perbandingan dengan baseline T-009/T-011; target p95 pivot ≤ 3 s dan tidak ada widget lain kena QUERY_TIMEOUT
- [ ] Given ekspor PDF dashboard berisi pivot terbesar yang diizinkan, then PDF selesai ≤ batas EXPORT_TIMEOUT dengan catatan potongan; given CSV/XLSX pivot 4 level, then nilai identik dengan tampilan (uji pembanding)
- [x] Given viewport 360 px dan 768 px, then e2e tangkapan layar pivot 4 level, editor field terhitung, dan daftar pivot tersimpan tanpa gulir horizontal halaman; axe-core tanpa pelanggaran serius

## Risk
Impact: hampir semua perubahan berupa uji/skrip/dokumen (e2e project baru pivot-lanjutan, skenario perf
pivot-lanjutan, mode `show` fixture dev). Perubahan aplikasi kecil: label pratinjau editor field
terhitung tanpa muted-foreground (kontras AA) dan wadah aksi PageHeader boleh turun baris di ≥ 768 px
(semua halaman; hanya membungkus bila aksi tidak muat).
Security (STRIDE): tidak ada jalur data/otorisasi baru. E2e menegaskan D6 (viewer: body dengan
savedPivotId/spec → 400 INVALID, halaman definisi 404). Fixture `show` hanya dev (menolak NODE_ENV=production,
akses DB langsung seperti mode lain).
Rollback: revert commit; tidak ada migrasi.
Validation: e2e pivot-lanjutan 8/8, widgets 25/25; perf docs/ai/perf/T-075.md (2 putaran A + 1 putaran B
pada 10 jt baris); uji unit page-header; aitk check.

## Notes
- Status per AC (2026-10-21, sesi cloud):
  - AC1: e2e `tests/e2e/pivot-lanjutan.spec.ts` (project pivot-lanjutan) 8/8 — pivot tersimpan 3 tingkat ×
    5 nilai (Laba + Margin terhitung, % dari total kolom, Top 5 Kota + "(Lainnya)") dibuat pemilik (nama
    lewat UI, bentuk lengkap lewat fixture lalu dimuat + disimpan ulang lewat editor tanpa kehilangan
    field), 4 widget diikat lewat panel, nilai = acuan yang dihitung tes dari CSV, sumber diubah (4
    tingkat, Pendapatan → Biaya) → keempatnya berubah, viewer melihat nilai sama, definisi 404, body
    berisi savedPivotId/spec → 400. Belum: suite penuh sekali sebelum close (oleh orkestrator).
  - AC2: TIDAK terpenuhi di kontainer cloud — rasio 4×8 vs 2×3 1,76–1,77× (cadangan 6 nilai tidak
    dipicu), tetapi p95 dingin 10 jt baris 8–10,8 s > 3 s (pivot 2×3 lama pun 4,6 s); cache hangat 2–6 ms;
    dashboard 6 widget terikat dingin ± 12 s tanpa QUERY_TIMEOUT/BUSY. Profil T-023 (olympus) belum
    diukur → pemilik; percepatan = T-hfqf.
  - AC3: CSV dan XLSX pivot 4 tingkat dibandingkan sel demi sel dengan tabel layar (lulus); halaman cetak
    /render (yang dibuka renderer) siap ± 4 s < RENDER_TIMEOUT_MS 60 s dengan catatan potongan. PDF
    sungguhan tidak bisa di kontainer ini (renderer Chromium menolak root tanpa --no-sandbox) → periksa
    di olympus. Temuan: kartu pivot kecil di cetak "0 dari 32 baris" → T-7ykh.
  - AC4: 360 dan 768 px (dashboard pivot 4 tingkat, editor field terhitung, daftar pivot tersimpan) tanpa
    gulir horizontal + axe tanpa serious/critical; tangkapan layar dengan E2E_SHOTS=<folder>. Dua bug
    diperbaiki: kontras label pratinjau editor field terhitung, aksi kepala dashboard meluap 195 px di
    768 px.
- Temuan lain: tabel terikat + total berjalan + Top N baris terdalam → galat yang tidak bisa diperbaiki
  pengguna → T-hbcp.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: tidak ada batas kepercayaan/komponen baru; uji, skrip perf, dan dua perubahan CSS/markup UI.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi; tes memakai PASSWORD dummy helpers (bukan rahasia asli).
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Diverifikasi e2e: viewer → halaman definisi pivot tersimpan 404, body /api/query dengan savedPivotId atau spec → 400 INVALID (D6 tidak berubah); tidak ada endpoint baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak ada input baru; fixture dev `show` hanya membaca berdasarkan id dan menolak NODE_ENV=production.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data sensitif tersimpan.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat/log baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: data uji sintetis, dibersihkan global teardown (dev-purge-test-data).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tanpa dependensi baru (axe-core, exceljs sudah ada); skrip perf hanya baca fixture lokal.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak ada alur bisnis baru; perf mencatat batas slot per user (QUERY_BUSY) sebagai pengamatan.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru di aplikasi; fixture perf di folder gitignored.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru; skema body widget tetap strict (diuji e2e).
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi/header baru; setelan perf mengikuti bawaan produksi.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T20:16:09Z (253371 ms)
- Acceptance criteria: 1/4 satisfied
- Commits: 07b7bf2, 0a6567a, 14e93e4, 17cb5cc, 1ad5b22, 20985af, 3f15210, 4115c8d, 460a7f3, 468e913, 52486eb, 594ca78, 5f3cb82, 60920fa, 61111df, 693edf2, 6f54377, 764bbce, 7ccff4c, 864037d, 8ce72cf, a4869d3, a80b5ae, a821c13, b5206c2, bb53812, c4a56e5, c7bb4f1, ccb8465, d13f79e, d23d4b2, d76daf2, e2c6cf1, eb70260, eb97953, ec22d22, f1bd517, f9bd2d5
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-code: 0 findings
