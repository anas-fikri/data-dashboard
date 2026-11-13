---
id: T-g8ht
title: 'v1.21 pembanding KPI: rasio ke ukuran lain (mis. diterima ÷ total) dan target angka tetap'
status: in_review
profile: strict
created: "2026-11-13T01:38:46Z"
updated: "2026-11-13T02:19:00Z"
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
      at: "2026-11-13T01:59:29Z"
      findings: 12
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-13T02:03:23Z"
      findings: 4
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 205528
    summary: |-
      …n't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794536073258,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794536073281,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794536073286,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794536073298,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794536084069,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  253 passed | 1 skipped (254)
            Tests  3377 passed | 10 skipped (3387)
         Start at  02:12:37
         Duration  137.22s (tests 81%, import 16%, transform 3%)

          Isolate  254 workers spawned · ~109ms startup each (spawn + environment, per file)
                   at least ~9.13s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.20.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T02:14:55Z"
    tree: 8a8fad2c0f31aab89fb65b2ebda4fd4ec3a6f31e427cda8f75aeec74f2e72331
  commits:
    - 1113f25
    - 711beaf
    - f7cf853
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-13T02:15:02Z"
    passed: true
    tree: 8a8fad2c0f31aab89fb65b2ebda4fd4ec3a6f31e427cda8f75aeec74f2e72331
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 558 dirs visited, 5213 inodes visited, 1 Extract calls, 111.679366ms elapsed, 111.679603ms wall time
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
Widget Angka bisa dibandingkan dengan ukuran lain di sheet + filter yang sama (persen, mis. diterima dari semua resi) atau dengan target angka tetap (persen pencapaian, ▲/▼ berwarna menurut penilaian), selain pembanding periode yang sudah ada.

## Acceptance criteria
- [x] Pembanding 'Ukuran lain': KPI menampilkan nilai ÷ ukuran kedua (sheet + filter sama) sebagai persen, mis. '95,1% dari Jumlah baris (5,0 jt)'
- [x] Pembanding 'Target angka': persen pencapaian + selisih ▲/▼ terhadap target tetap, warna mengikuti penilaian (bawaan: lebih tinggi lebih baik)
- [x] Pembanding periode tetap seperti sebelumnya; ukuran pembanding ikut remap kolom saat ganti data; PDF/ekspor konsisten
- [x] Uji unit + e2e; panduan susun-dashboard + Yang baru

## Risk
Impact: tampilan saja (spec widget opsional / ringkasan metrik). Security: tidak ada permukaan baru (spec divalidasi zod, metrik tetap angka gabungan). Rollback: tanpa migrasi; widget ber-pembanding baru tidak valid di versi lama. Validation: unit + e2e kpi-drill + metrics.

## Notes

- 2026-11-13T01:38:54Z Permintaan pemilik 2026-11-13: pembanding selain periode, opsi 1 (rasio ke ukuran lain) + 2 (target angka).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — hanya spec widget + tampilan; tanpa batas kepercayaan baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — jalur simpan widget lama (editor/pemilik) tidak berubah
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — reference divalidasi zod (union strict, angka finite); kolom lewat posisi skema, tanpa SQL dari klien
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — pesan INVALID tanpa rincian internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — pembanding tidak mengubah data; tidak bersamaan dengan pembanding periode (refine)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — spec widget lewat parseWidgetConfig (zod) seperti sebelumnya
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T02:14:55Z (205528 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 1113f25, 711beaf, f7cf853
- Review pass 1 by claude-reviewer-subagent: 12 findings
- Review pass 2 by claude-reviewer-subagent: 4 findings
