---
id: T-xp28
title: 'v1.15.1: perbaikan rilis — rollback kenali tabel rilis, masa tunggu sehat app, cache build npm'
status: done
profile: strict
tags:
  - deploy
created: "2026-11-11T02:18:54Z"
updated: "2026-11-11T03:32:18Z"
closed: "2026-11-11T03:32:18Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 998095958b143111ed09228764d3fbaca501a2f9
paths:
  - CHANGELOG.md
  - Dockerfile
  - content/panduan/06-susun-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - deploy/upgrade.sh
  - docker-compose.prod.yml
  - docs/runbook-deploy.md
  - package.json
  - src/app/globals.css
  - src/components/dashboards/config-sections.tsx
  - src/components/widgets/chart-table.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/drill-dialog.tsx
  - src/features/whats-new/entries.ts
  - tests/components/drill.test.ts
  - tests/e2e/kpi-drill.spec.ts
  - tests/scripts/upgrade-gates.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-11T02:45:39Z"
      findings: 3
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-11T02:47:33Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 171925
    summary: |-
      …t":"127.0.0.1","port":35705,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794367696756,"service":"data-dashboard","host":"127.0.0.1","port":34379,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794367696850,"service":"data-dashboard","host":"127.0.0.1","port":38277,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794367696959,"service":"data-dashboard","host":"127.0.0.1","port":36325,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794367698909,"service":"data-dashboard","datasetId":"t072mwbk74xuds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794367709748,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794367719578,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794367719602,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794367719605,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794367719618,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  244 passed | 1 skipped (245)
            Tests  3270 passed | 10 skipped (3280)
         Start at  03:26:58
         Duration  117.10s (tests 80%, import 17%, transform 3%)

          Isolate  245 workers spawned · ~102ms startup each (spawn + environment, per file)
                   at least ~8.24s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.15.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-11T03:28:57Z"
    tree: 54ed2ab0070577ffb5f5b1c67c533fa7ed85a51be6c66cd810674586dee39234
  commits:
    - 1892c10
    - 19af165
    - 202826f
    - "2472318"
    - 51fa41a
    - 63a7f03
    - c5f372b
    - d6d31c9
    - e82f68a
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-11T03:28:57Z"
    passed: true
    tree: 54ed2ab0070577ffb5f5b1c67c533fa7ed85a51be6c66cd810674586dee39234
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 544 dirs visited, 3775 inodes visited, 1 Extract calls, 77.480567ms elapsed, 77.480777ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.15.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Pelajaran deploy v1.15.0 (2026-11-10): rollback ditolak karena tabel DashboardView (v1.14) tidak ada di daftar NEW_TABLES upgrade.sh; app butuh > 75 dtk sehat setelah backup + build di VM sehingga `up --wait`/proxy gagal padahal app sehat sendiri; build di Mac macet di `npm ci` karena lapisan dependensi selalu dibangun ulang (versi package.json naik tiap rilis). Perbaiki ketiganya tanpa mengubah perilaku produksi lain, dan catat langkah deploy lewat server (disk, NAS penuh) di runbook.

## Acceptance criteria
- [x] Given database berisi tabel DashboardView atau tabel lain yang dibuat migrasi rilis (CREATE TABLE), when upgrade.sh rollback memeriksa database tujuan, then pemeriksaan lolos; tabel asing tetap ditolak sebelum app/worker dihentikan
- [x] Given app butuh 75–120 dtk sampai /api/health/core lulus, when deploy.sh menjalankan up --wait, then compose menunggu (start_period 120 dtk) dan tidak menyatakan app unhealthy
- [x] Given rilis hanya menaikkan versi package.json, when image dibangun ulang dengan cache yang ada, then lapisan npm ci memakai cache; Dockerfile tetap bisa dibangun dengan BuildKit maupun builder lama
- [x] Given pemilik deploy lewat server, when membaca runbook, then ada langkah untuk disk kurang (hapus image rollback lama, cache build) dan NAS penuh saat preflight

## Risk
Impact: deploy/upgrade.sh (rollback_target_check: NEW_TABLES + DashboardView, release_tables dari CREATE TABLE migrasi kode rilis), docker-compose.prod.yml (healthcheck app start_period 120s), Dockerfile (tahap manifest tanpa versi untuk lapisan npm ci), runbook §24/§25.
Security (STRIDE): rollback hanya makin longgar untuk tabel yang dibuat migrasi aplikasi ini sendiri; cek nama database preflight, _prisma_migrations di dump, dan tabel asing tetap menolak sebelum app/worker dihentikan; masa mulai 120 dtk tidak menyembunyikan app rusak lebih dari ± 165 dtk (wait-timeout 600); Dockerfile tanpa secret, versi asli tetap dari COPY . . di tahap build; perintah runbook memakai label compose dashboard (tidak menyentuh container aplikasi lain).
Rollback: revert berkas deploy ke v1.15.0; tanpa migrasi.
Validation: tests/scripts/upgrade-gates.test.ts (28), docker compose config, uji build deps BuildKit + builder lama (cache-hit saat versi naik), npm ci --dry-run; review subagen 2 putaran → 0.

## Notes

- 2026-11-11T03:18:54Z Bukti: tests/scripts/upgrade-gates.test.ts (DashboardView + CREATE TABLE migrasi rilis termasuk "public"."X" lolos, tabel asing ditolak sebelum stop); docker compose config → start_period 2m0s; uji build tahap deps (BuildKit dan DOCKER_BUILDKIT=0) dua kali dengan versi berbeda → lapisan dependensi cache-hit; npm ci --dry-run menerima manifest tanpa versi; runbook §25. Suite e2e per proyek: 39/41 lulus; data-view-a11y AC2 gagal juga di v1.14 (T-7377); mapping (period-mapping AC2 timeout) lulus 7/7 saat diulang. E2E terarah di kode akhir d6d31c9: kpi-drill 4/4, chart-polish 9/9, dashboard-flex 4/4. Review subagen: T-xp28 2 putaran → 0, T-j25e 3 putaran → 0. Vitest 3270 lulus.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas: skrip operator di server (pemilik menjalankan); tidak ada input jaringan baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak disentuh perubahan ini
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak disentuh perubahan ini
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Pesan rollback menyebut tabel asing tanpa data sensitif.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Tidak ada dependensi baru; tahap manifest hanya node -e menulis ulang versi.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Dockerfile tetap tanpa secret, base image dipin digest; healthcheck tetap aktif (hanya masa mulai).

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-11T03:28:57Z (171925 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 1892c10, 19af165, 202826f, 2472318, 51fa41a, 63a7f03, c5f372b, d6d31c9, e82f68a
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
