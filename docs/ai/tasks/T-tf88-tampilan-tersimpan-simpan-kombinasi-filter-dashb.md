---
id: T-tf88
title: 'Tampilan tersimpan: simpan kombinasi filter dashboard dengan nama'
status: done
profile: strict
tags:
  - dashboards
created: "2026-11-10T01:17:13Z"
updated: "2026-11-10T03:27:41Z"
closed: "2026-11-10T03:27:41Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 2dc0d7f261578ed2af821271cec71d047557d62e
paths:
  - CHANGELOG.md
  - content/panduan/01-mengenal-data-dashboard.md
  - content/panduan/06-susun-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - docs/runbook-deploy.md
  - playwright.config.ts
  - prisma/migrations/20261110000000_dashboard_views/migration.sql
  - prisma/schema.prisma
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/api/dashboards/[id]/views/[viewId]/route.ts
  - src/app/api/dashboards/[id]/views/route.ts
  - src/app/api/search/route.ts
  - src/app/globals.css
  - src/components/dashboards/auto-refresh.tsx
  - src/components/dashboards/bound-config-model.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/dashboard-more-menu.tsx
  - src/components/dashboards/filters/filter-bar.tsx
  - src/components/dashboards/filters/filter-context.tsx
  - src/components/dashboards/filters/filter-model.ts
  - src/components/dashboards/filters/saved-views.tsx
  - src/components/dashboards/tv-mode.tsx
  - src/components/shell/app-shell.tsx
  - src/components/shell/quick-search.tsx
  - src/components/ui/dropdown-menu.tsx
  - src/components/widgets/widget-query.ts
  - src/features/dashboards/actions.ts
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - src/features/dashboards/views.ts
  - src/features/datasets/validation.ts
  - src/features/search/service.ts
  - src/features/whats-new/entries.ts
  - tests/components/dashboard-page-access.test.ts
  - tests/e2e/dashboard-flex.spec.ts
  - tests/e2e/guide-roles.spec.ts
  - tests/features/dashboards/duplicate.test.ts
  - tests/features/dashboards/views.test.ts
  - tests/features/search/quick-search.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-10T03:00:50Z"
      findings: 3
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-10T03:00:51Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 197478
    summary: |-
      …t":"127.0.0.1","port":41851,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794280989915,"service":"data-dashboard","host":"127.0.0.1","port":40839,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794280990014,"service":"data-dashboard","host":"127.0.0.1","port":35671,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794280990116,"service":"data-dashboard","host":"127.0.0.1","port":46501,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794280990402,"service":"data-dashboard","datasetId":"t072mwa4ko4lds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794281003426,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794281008337,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794281008362,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794281008364,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794281008378,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  242 passed | 1 skipped (243)
            Tests  3246 passed | 10 skipped (3256)
         Start at  03:21:37
         Duration  133.46s (tests 81%, import 16%, transform 3%)

          Isolate  243 workers spawned · ~116ms startup each (spawn + environment, per file)
                   at least ~9.26s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.13.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-10T03:23:52Z"
    tree: 5228be907608bd6341b77b8727a172f35bd43331a4014ef2f8730574a5165104
  commits:
    - 0f62982
    - 1a1a432
    - 2dc0d7f
    - 353960b
    - 355944b
    - 99eea5c
    - a725c7b
    - b7ddea3
    - bae5de1
    - c09567f
    - d7bc81b
    - f56c021
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-10T03:23:53Z"
    passed: true
    tree: 5228be907608bd6341b77b8727a172f35bd43331a4014ef2f8730574a5165104
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 539 dirs visited, 3434 inodes visited, 1 Extract calls, 87.978587ms elapsed, 87.978858ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.13.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Pengguna menyimpan kombinasi filter dashboard dengan nama (mis. Jakarta – bulan ini), memilihnya kembali dari menu Tampilan, dan membagikannya lewat link; tampilan pribadi per pengguna, pemilik/editor bisa membuat tampilan bersama untuk semua yang punya akses.

## Acceptance criteria
- [x] Given filter dashboard aktif, when pengguna memilih Simpan tampilan dan memberi nama, then tampilan tersimpan (pribadi) dan muncul di menu Tampilan dashboard itu
- [x] Given pemilik/editor, when menyimpan tampilan sebagai bersama, then semua yang punya akses dashboard melihatnya; viewer hanya bisa membuat tampilan pribadi
- [x] Given tampilan dipilih, when diterapkan, then filter di URL diganti dengan filter tampilan itu (link bisa dibagikan); tampilan bisa diganti nama dan dihapus oleh pembuatnya (bersama: pemilik/editor)
- [x] Given kolom filter dihapus dari dashboard, when tampilan lama dipilih, then filter untuk kolom yang hilang diabaikan tanpa galat

## Risk
Impact: tampilan tersimpan — migrasi tabel baru DashboardView, service src/features/dashboards/views.ts, route /api/dashboards/[id]/views(/[viewId]) lewat features/dashboards/http.ts, UI filters/saved-views.tsx, applyState/widgetIds di filter-context, parseFilterState di filter-model.
Security (STRIDE): IDOR — daftar/ubah/hapus disaring OR userId/shared + peran (dashboardAccess), syarat akses juga di WHERE penulisan (updateMany/deleteMany); Elevation — tampilan bersama hanya pemilik/editor, pembuat yang bukan editor lagi hanya bisa menjadikan pribadi/hapus; Tampering/DoS — status divalidasi skema ?f= + batas panjang URL, batas 20 per user dan 20 bersama per dashboard (juga saat dijadikan bersama) di bawah advisory lock; CSRF — rejectCrossOrigin + body JSON ≤ 64 KB + rate limit dashboardEdit.
Rollback: revert image ke v1.13.0 aman (tabel baru diabaikan); tidak perlu menurunkan migrasi.
Validation: tests/features/dashboards/views.test.ts (8), e2e dashboard-flex T-tf88, filters/sharing e2e, suite e2e per proyek.

## Notes

- 2026-11-10T03:20:33Z tests/features/dashboards/views.test.ts (8: daftar pribadi+bersama, viewer pribadi saja, bersama pemilik/editor, validasi nama/status, batas per user/bersama termasuk pribadi→bersama di bawah lock, NAME_TAKEN/BUSY, syarat akses di WHERE update/delete, mantan editor hanya jadikan pribadi/hapus); e2e dashboard-flex T-tf88 (simpan bersama, pilih kembali → f di URL, ganti nama, hapus); applyState menyaring kolom yang hilang (sanitize). Bukti: suite e2e per proyek lulus (data-view-a11y AC2 → T-7377, bukan v1.14); review subagen 3 putaran → 0 temuan; aitk check + audit hijau.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Tabel baru per (dashboard, user); route baru memakai kerangka mutation yang sama (origin, ukuran, rate limit)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — dashboardAccess per permintaan; pribadi orang lain tidak pernah terbaca/tertulis (OR userId/shared di WHERE baca dan tulis); bersama: pemilik/editor
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Nama cleanName ≤ 60; status parseFilterState (skema ?f=, ≤ URL_PARAM_MAX) saat simpan dan dibaca ulang; id isIdShape
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Galat tak terduga → 503 umum (withUser); pesan bisa ditindak tanpa detail internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Hanya nama + status filter (bukan data dataset); ikut terhapus bersama dashboard/user (cascade)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Batas tampilan per user dan bersama di bawah advisory lock (termasuk pribadi → bersama); nama unik per (dashboard, user)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Body JSON ≤ 64 KB
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Route JSON dengan status kode konsisten (400/403/404/409/429), rate limit dashboardEdit, Origin wajib
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Migrasi hanya menambah tabel (aman untuk rollback image)

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-10T03:23:52Z (197478 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 0f62982, 1a1a432, 2dc0d7f, 353960b, 355944b, 99eea5c, a725c7b, b7ddea3, bae5de1, c09567f, d7bc81b, f56c021
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
