---
id: T-7ykh
title: Tampilkan baris data pivot bertingkat di halaman cetak kartu kecil
status: done
profile: strict
goal: G-7
tags:
  - pdf
created: "2026-10-21T19:46:55Z"
updated: "2026-10-21T21:30:37Z"
closed: "2026-10-21T21:30:37Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 3f0008e2990162242c5c5f494b3550f7f4ea5f71
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
  - src/components/render/print-card.tsx
  - src/components/render/print-pivot.tsx
  - src/components/saved-pivots/saved-pivot-editor.tsx
  - src/components/saved-pivots/saved-pivot-list.tsx
  - src/components/saved-pivots/saved-pivot-page.tsx
  - src/components/ui/page-header.tsx
  - src/components/widgets/absent-note.tsx
  - src/components/widgets/body-state.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/table-expand.tsx
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-query.ts
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
  - tests/components/kpi-line-height.test.ts
  - tests/components/native-undo-guard.test.ts
  - tests/components/page-header.test.ts
  - tests/components/pivot-filters.test.ts
  - tests/components/pivot-ui.test.ts
  - tests/components/saved-pivot-ui.test.ts
  - tests/components/widget-absent.test.ts
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
      at: "2026-10-21T21:26:49Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-21T21:26:50Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 201385
    summary: |-
      …asetId":"t072mvimklk1ds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792618167720,"service":"data-dashboard","host":"127.0.0.1","port":38723,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792618167772,"service":"data-dashboard","host":"127.0.0.1","port":33043,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792618167875,"service":"data-dashboard","host":"127.0.0.1","port":45537,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792618167981,"service":"data-dashboard","host":"127.0.0.1","port":45939,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792618180197,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792618182213,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792618182236,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792618182240,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792618182253,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3021 passed | 10 skipped (3031)
         Start at  21:27:49
         Duration  140.98s (tests 83%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~148ms startup each (spawn + environment, per file)
                   at least ~10.97s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T21:30:12Z"
    tree: f9480a784dccb1da9af6a9704d003ab568fcc961a1814b3e4e26f5b69ba807e6
  commits:
    - 0a6567a
    - 21e6bd7
    - 3f0008e
    - 460a7f3
    - 5cf7246
    - 62dfa2b
    - ccb8465
    - d16ff25
    - e0ec8e7
    - e435538
    - eb97953
    - ee2a976
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-21T21:30:12Z"
    passed: true
    tree: f9480a784dccb1da9af6a9704d003ab568fcc961a1814b3e4e26f5b69ba807e6
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5266 inodes visited, 1 Extract calls, 224.595564ms elapsed, 224.595715ms wall time
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
Ditemukan T-075: pivot 4 tingkat di kartu ukuran bawaan (widget baru via API) dicetak sebagai 'Menampilkan 0 dari 32 baris' — hanya kepala kelompok Barat › Kilat › Kota 07 yang muat, tanpa satu pun baris data (src/features/widgets/pivot-table.ts fittingPivotRows, src/components/render/print-pivot.tsx). Ada catatan potongan, jadi tidak diam-diam, tetapi PDF tidak berguna. Pastikan setidaknya satu kelompok utuh (kepala + baris + subtotal) muat, atau pindahkan kepala kelompok menjadi kolom label seperti ekspor CSV, atau beri petunjuk 'perbesar kartu' di catatan.

## Acceptance criteria
- [x] Given pivot 4 tingkat di kartu 4×4 grid di halaman cetak, then minimal satu baris data tampil atau catatan menyarankan memperbesar kartu; e2e pivot-lanjutan menguji kartu kecil

## Risk
Impact: hanya teks catatan bawah pivot di halaman cetak/PDF (print-pivot.tsx) saat tidak satu pun baris
data muat; tata letak dan pemilihan baris tidak berubah.
Security (STRIDE): tidak ada permukaan baru (teks statis).
Rollback: revert commit T-7ykh.
Validation: tests/components/pivot-ui.test.ts (T-7ykh); e2e --project=pivot-lanjutan (kartu "Pivot kecil"
4×4, pivot 4 tingkat: 0 baris data → catatan memuat petunjuk dan petunjuk tidak terpotong line-clamp).

## Notes
- Pilihan (2026-10-21): catatan potongan menambah "Perbesar kartu agar baris data muat" tepat setelah
  "Menampilkan 0 dari N baris" (awal catatan, jadi tetap terlihat walau catatan dipotong 2 baris). Tidak
  memaksa baris data muat: kartu 4×4 hanya memuat 3 kepala kelompok + Total, dan kepala kelompok
  (dengan subtotal) tetap informatif. Diverifikasi e2e: kartu kecil mencetak 0 baris data + petunjuk.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya teks statis catatan pivot di halaman cetak; tidak ada input, data, endpoint, atau konfigurasi baru.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T21:30:12Z (201385 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 0a6567a, 21e6bd7, 3f0008e, 460a7f3, 5cf7246, 62dfa2b, ccb8465, d16ff25, e0ec8e7, e435538, eb97953, ee2a976
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-code: 0 findings
