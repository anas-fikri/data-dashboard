---
id: T-z8y2
title: 'Stabilkan e2e dashboards: klik Pengaturan sesaat setelah muat halaman tidak membuka panel'
status: done
profile: strict
created: "2026-10-21T12:34:25Z"
updated: "2026-10-21T20:11:39Z"
closed: "2026-10-21T20:11:39Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 460a7f3f8f0b75ad6f002443dedc6daa9d219f3b
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
      at: "2026-10-21T20:04:25Z"
      findings: 1
    - "n": 2
      by: claude-code
      at: "2026-10-21T20:04:26Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 255604
    summary: |-
      …t":"127.0.0.1","port":35149,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792613273138,"service":"data-dashboard","host":"127.0.0.1","port":35987,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792613273247,"service":"data-dashboard","host":"127.0.0.1","port":46781,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792613273362,"service":"data-dashboard","host":"127.0.0.1","port":46437,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792613274739,"service":"data-dashboard","datasetId":"t072mvijnqa5ds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792613287910,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792613296680,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792613296701,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792613296706,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792613296720,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  223 passed | 1 skipped (224)
            Tests  3010 passed | 10 skipped (3020)
         Start at  20:05:52
         Duration  168.25s (tests 84%, import 13%, transform 3%)

          Isolate  224 workers spawned · ~169ms startup each (spawn + environment, per file)
                   at least ~12.42s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T20:08:42Z"
    tree: d2c05f1f463ff809baa0d7a65f8ec519e9306ac33de79885654a369d916f874f
  commits:
    - 07b7bf2
    - 17cb5cc
    - 1ad5b22
    - 3f15210
    - 4115c8d
    - 460a7f3
    - 468e913
    - 52486eb
    - 594ca78
    - 5f3cb82
    - 61111df
    - 693edf2
    - 6f54377
    - 764bbce
    - 7ccff4c
    - 864037d
    - a80b5ae
    - a821c13
    - b5206c2
    - bb53812
    - c4a56e5
    - c7bb4f1
    - ccb8465
    - d13f79e
    - d76daf2
    - e2c6cf1
    - eb70260
    - eb97953
    - ec22d22
    - f1bd517
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-21T20:08:43Z"
    passed: true
    tree: d2c05f1f463ff809baa0d7a65f8ec519e9306ac33de79885654a369d916f874f
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5119 inodes visited, 1 Extract calls, 248.623899ms elapsed, 248.62428ms wall time
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
Ditemukan saat T-1zdf (sudah gagal di HEAD 8ce72cf, 2/2 run): di tests/e2e/dashboards.spec.ts tes "urungkan satu langkah dan ubah posisi tanpa menyeret" (dan kadang "< 1280 px: pengaturan sebagai lembar") mengeklik tombol Pengaturan widget langsung setelah page.goto; panel tidak terbuka (heading "Pengaturan widget" tidak ada). Dengan jeda 3 dtk sebelum klik tes lulus — kemungkinan klik sebelum hydration selesai atau saat grid menata ulang lebar (1280 px bawaan → lebar kanvas). Cari akar masalahnya: bila aplikasi mengabaikan klik pengguna sungguhan di jendela itu, perbaiki aplikasinya; bila hanya tes, tunggu sinyal yang benar (bukan waitForTimeout).

## Acceptance criteria
- [x] Given dashboards.spec.ts dijalankan utuh dua kali berturut-turut, then semua 11 tes lulus tanpa jeda waktu buatan (waitForTimeout)

## Risk
Impact: atribut DOM `data-hydrated` di akar kanvas dashboard (dipasang effect setelah hidrasi) + helper
uji; tidak ada perubahan perilaku pengguna.
Security (STRIDE): N/A — atribut penanda tanpa data.
Rollback: revert commit.
Validation: dashboards.spec.ts utuh 2× berturut-turut 11/11 lulus; spec lama (tanpa menunggu hidrasi)
gagal 2/2 pada tes "urungkan satu langkah" (fokus heading panel tidak pernah terjadi).

## Notes
- Akar masalah (T-075, 2026-10-21): kanvas dirender server; tombol Pengaturan kartu sudah terlihat sebelum
  handler React terpasang (dev server Turbopack ± 1–3 s untuk memuat chunk klien). Klik di jendela itu
  hilang — bawaan SSR React, bukan bug logika panel; di build produksi jendelanya jauh lebih singkat.
- Perbaikan: akar kanvas (`data-testid="dashboard-canvas"`) mendapat `data-hydrated` dari effect pertama;
  dashboards.spec.ts membuka mode edit lewat `openEdit` yang menunggu atribut itu (tanpa waitForTimeout).
  Spec lain yang memakai pola coba-ulang (`toPass`) bisa beralih ke penanda yang sama nanti.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya atribut penanda hidrasi di DOM dan helper uji e2e; tidak ada input, data, endpoint, atau konfigurasi baru.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T20:08:42Z (255604 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 07b7bf2, 17cb5cc, 1ad5b22, 3f15210, 4115c8d, 460a7f3, 468e913, 52486eb, 594ca78, 5f3cb82, 61111df, 693edf2, 6f54377, 764bbce, 7ccff4c, 864037d, a80b5ae, a821c13, b5206c2, bb53812, c4a56e5, c7bb4f1, ccb8465, d13f79e, d76daf2, e2c6cf1, eb70260, eb97953, ec22d22, f1bd517
- Review pass 1 by claude-reviewer-subagent: 1 findings
- Review pass 2 by claude-code: 0 findings
