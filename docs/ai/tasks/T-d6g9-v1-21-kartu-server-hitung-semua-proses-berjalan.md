---
id: T-d6g9
title: 'v1.21 kartu Server: hitung semua proses berjalan (unggah, koreksi skema, ekspor/PDF) + ringkasan angka saat sidebar dic…'
status: in_review
profile: strict
created: "2026-11-13T01:38:46Z"
updated: "2026-11-13T02:26:38Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 648ad69539b7c4ad5a2afe17e74e923cea112809
paths:
  - CHANGELOG.md
  - content/panduan/01-mengenal-data-dashboard.md
  - content/panduan/06-susun-dashboard.md
  - src/components/dashboards/kpi-compare-fields.tsx
  - src/components/dashboards/status-fields.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/metrics/server-card.tsx
  - src/components/render/print-card.tsx
  - src/components/widgets/kpi-compare.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/widget-body.tsx
  - src/features/metrics/view.ts
  - src/features/query/widget.ts
  - src/features/whats-new/entries.ts
  - src/features/widgets/remap.ts
  - src/features/widgets/spec.ts
  - src/lib/metrics/sampler.ts
  - src/lib/metrics/store.ts
  - tests/components/kpi-compare.test.ts
  - tests/components/server-card.test.ts
  - tests/e2e/kpi-drill.spec.ts
  - tests/e2e/metrics.spec.ts
  - tests/features/widgets/remap.test.ts
  - tests/lib/metrics-sampler.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T02:03:23Z"
      findings: 2
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 200543
    summary: |-
      …n't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794536530604,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794536530625,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794536530629,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794536530640,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794536541386,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  253 passed | 1 skipped (254)
            Tests  3377 passed | 10 skipped (3387)
         Start at  02:20:17
         Duration  134.37s (tests 81%, import 16%, transform 3%)

          Isolate  254 workers spawned · ~105ms startup each (spawn + environment, per file)
                   at least ~8.77s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.20.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T02:22:32Z"
    tree: 8a8fad2c0f31aab89fb65b2ebda4fd4ec3a6f31e427cda8f75aeec74f2e72331
  commits:
    - 1113f25
    - 711beaf
    - f7cf853
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-11-13T02:22:41Z"
    passed: true
    tree: 8a8fad2c0f31aab89fb65b2ebda4fd4ec3a6f31e427cda8f75aeec74f2e72331
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 558 dirs visited, 5214 inodes visited, 1 Extract calls, 108.931282ms elapsed, 108.931493ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.20.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Kartu Server di sidebar menyebut semua proses latar yang berjalan/menunggu (unggahan, koreksi skema, ekspor/PDF) dan tetap menampilkan ringkasan CPU/RAM + jumlah proses saat sidebar diciutkan.

## Acceptance criteria
- [x] Kartu Server menyebut semua proses (unggahan, koreksi skema, ekspor/PDF) berjalan/menunggu
- [x] Sidebar diciutkan menampilkan ikon status + CPU/RAM + jumlah proses berjalan, berlabel untuk pembaca layar
- [x] Uji unit sampler/kartu + e2e metrics

## Risk
Impact: tampilan saja (spec widget opsional / ringkasan metrik). Security: tidak ada permukaan baru (spec divalidasi zod, metrik tetap angka gabungan). Rollback: tanpa migrasi; widget ber-pembanding baru tidak valid di versi lama. Validation: unit + e2e kpi-drill + metrics.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — hanya hitungan antrean di Redis + tampilan kartu
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — /api/metrics tetap untuk user login, hanya angka gabungan (tanpa nama job/user)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak disentuh perubahan ini
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — hanya jumlah proses per jenis, tanpa data pengguna
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — hitungan baca-saja dengan batas waktu per antrean
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T02:22:32Z (200543 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 1113f25, 711beaf, f7cf853
- Review pass 1 by claude-reviewer-subagent: 2 findings
