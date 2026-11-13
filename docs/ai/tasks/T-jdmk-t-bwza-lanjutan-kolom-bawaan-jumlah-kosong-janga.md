---
id: T-jdmk
title: 'T-bwza lanjutan: kolom bawaan Jumlah kosong jangan memilih kolom pembanding KPI'
status: in_review
profile: strict
created: "2026-11-11T07:50:33Z"
updated: "2026-11-13T07:00:44Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 434c0b745ad22ff01f6c055b50b932361f51fdb9
paths:
  - CHANGELOG.md
  - docker-compose.prod.yml
  - docs/runbook-deploy.md
  - package.json
  - src/app/api/metrics/route.ts
  - src/components/admin/resources-panel.tsx
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/metrics/server-card.tsx
  - src/components/shell/app-shell.tsx
  - src/components/ui/search-select.tsx
  - src/features/ingest/period-plan.ts
  - src/features/metrics/accounts.ts
  - src/features/metrics/view.ts
  - src/lib/metrics/host.ts
  - src/lib/metrics/sampler.ts
  - src/lib/metrics/store.ts
  - tests/components/widget-config.test.ts
  - tests/features/ingest/period-plan.test.ts
  - tests/features/metrics-accounts-jobs.test.ts
  - tests/lib/metrics.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T06:52:49Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 235436
    summary: |-
      …vice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794552967788,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794552969276,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794552969280,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794552969282,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  253 passed | 3 skipped (256)
            Tests  3376 passed | 29 skipped (3405)
         Start at  06:53:38
         Duration  159.34s (tests 84%, import 14%, transform 2%)

          Isolate  256 workers spawned · ~111ms startup each (spawn + environment, per file)
                   at least ~9.39s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.5 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T06:56:18Z"
    tree: b4126e97a97211995cd89515d6dbfdbbe8ddc32479e9011d7617c8a607d94cba
  commits:
    - 000f2ab
    - 0e6065c
    - 0f5241b
    - 10be0fe
    - 1113f25
    - 139ea63
    - 170b893
    - 1777cf3
    - 18ad0a8
    - 1f127d7
    - 1fa2a2b
    - 24e0d05
    - 26454a6
    - "2762863"
    - 280999b
    - 2a4785d
    - 2b1c079
    - 3171ffa
    - 320d807
    - 347467d
    - 3b6ad9e
    - 434c0b7
    - 441a240
    - 45146c1
    - "4850467"
    - 4a2e710
    - 52d859a
    - 53b72de
    - 562459f
    - 56ac448
    - 5815e7e
    - 589ab6c
    - 5a2674d
    - 6237d6d
    - 648ad69
    - 64c3c85
    - "6574710"
    - 681c251
    - 683ea1f
    - 6aca388
    - 6af2ee7
    - 6b5c285
    - 711beaf
    - 7288cca
    - "7336191"
    - 741a155
    - "76492e3"
    - 76c1d1c
    - 77a5cd1
    - 79246cf
    - 7dc7885
    - 7ddd569
    - 7e67256
    - "8049e15"
    - 80cc079
    - 8325cf5
    - 84ba18e
    - 85626d5
    - 856bae9
    - 86636d7
    - 8b0a10f
    - 8b7909f
    - 8c7f091
    - 8d5bf1d
    - 8dc3860
    - 914b030
    - 92ee216
    - 957a6dd
    - 95a30ac
    - 95f55db
    - "9803850"
    - 9b62f18
    - 9cfda54
    - a04e7fb
    - a079f81
    - a12fcfb
    - a18c5e1
    - a544a24
    - a70a59a
    - aa93391
    - ace71fc
    - b1036b4
    - b421bcc
    - b43e7d6
    - b4d9cbb
    - ba29099
    - bea7eec
    - bf81be6
    - c3eb267
    - c4eab09
    - c4f995f
    - c70623a
    - c7ca1a6
    - cb2bb63
    - cb50be9
    - d3794b5
    - d7d32e5
    - dd124a1
    - e1a05ba
    - e4b98f0
    - e6e94a4
    - e7488c7
    - e85dcdd
    - eb11b82
    - ee21607
    - ee92331
    - ef3422a
    - ef7600f
    - f256b4d
    - f7cf853
    - fd66af5
    - ff2deb1
    - ffc9089
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-11-13T06:56:40Z"
    passed: true
    tree: b4126e97a97211995cd89515d6dbfdbbe8ddc32479e9011d7617c8a607d94cba
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 558 dirs visited, 5642 inodes visited, 1 Extract calls, 105.884679ms elapsed, 105.884897ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.21.5 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Merapikan dua temuan Low T-bwza: pemilihan otomatis kolom tidak lagi memilih kolom pembanding KPI, dan kotak cari daftar pilihan tidak membuka keyboard ponsel otomatis.

## Acceptance criteria
- [x] Ganti Nilai pada KPI berpembanding tidak memilih otomatis kolom tanggal pembanding (widget tetap valid)
- [x] Daftar pilihan berkotak cari tidak memfokus kotak cari otomatis di layar sentuh (sama dengan Select biasa)

## Risk
Impact: panel pengaturan widget (pilihan Nilai) dan SearchSelect di layar sentuh. Security: N/A (UI). Rollback: versi sebelumnya. Validation: uji unit measureForChoice; aitk check.

## Notes
- 2026-11-11T07:50:45Z Low review r2 T-bwza (L-b): KPI Jumlah baris + pembanding pada 'Tgl terima', ganti ke Jumlah kosong → measureForChoice (widget-config-model.ts ±117, pilih nullPct > 0) bisa memilih 'Tgl terima' = kolom pembanding → widget langsung INVALID (panel memberi pesan). Lewati kolom pembanding KPI saat memilih otomatis. Juga: belum ada uji untuk kolom absent di daun field terhitung (probe review mengonfirmasi SQL).
- 2026-11-11T08:42:10Z Low review r3 T-bwza (L2): Nilai/Hitung/Ukuran kini 8 pilihan → SearchSelect; di layar sentuh kotak cari langsung fokus (keyboard ponsel terbuka untuk daftar pendek), beda dengan Select biasa yang sengaja tidak memfokus di pointer coarse (select.tsx ±150). Pilihan: samakan cek coarsePointer di search-select.tsx, atau naikkan SEARCH_MIN / kecualikan daftar ukuran.
- 2026-11-13T06:52:12Z Uji kolom absent di daun field terhitung tidak ditambah (sudah dikonfirmasi probe review T-bwza).
- 2026-11-13T06:52:50Z Review: 0 blocking. Low: panah di pemicu (sentuh+keyboard) tidak memindah pilihan; aria-hidden trigger saat VoiceOver iOS perlu cek perangkat; laptop sentuh+mouse kehilangan fokus otomatis (pointer: coarse).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-13T06:56:18Z (235436 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 000f2ab, 0e6065c, 0f5241b, 10be0fe, 1113f25, 139ea63, 170b893, 1777cf3, 18ad0a8, 1f127d7, 1fa2a2b, 24e0d05, 26454a6, 2762863, 280999b, 2a4785d, 2b1c079, 3171ffa, 320d807, 347467d, 3b6ad9e, 434c0b7, 441a240, 45146c1, 4850467, 4a2e710, 52d859a, 53b72de, 562459f, 56ac448, 5815e7e, 589ab6c, 5a2674d, 6237d6d, 648ad69, 64c3c85, 6574710, 681c251, 683ea1f, 6aca388, 6af2ee7, 6b5c285, 711beaf, 7288cca, 7336191, 741a155, 76492e3, 76c1d1c, 77a5cd1, 79246cf, 7dc7885, 7ddd569, 7e67256, 8049e15, 80cc079, 8325cf5, 84ba18e, 85626d5, 856bae9, 86636d7, 8b0a10f, 8b7909f, 8c7f091, 8d5bf1d, 8dc3860, 914b030, 92ee216, 957a6dd, 95a30ac, 95f55db, 9803850, 9b62f18, 9cfda54, a04e7fb, a079f81, a12fcfb, a18c5e1, a544a24, a70a59a, aa93391, ace71fc, b1036b4, b421bcc, b43e7d6, b4d9cbb, ba29099, bea7eec, bf81be6, c3eb267, c4eab09, c4f995f, c70623a, c7ca1a6, cb2bb63, cb50be9, d3794b5, d7d32e5, dd124a1, e1a05ba, e4b98f0, e6e94a4, e7488c7, e85dcdd, eb11b82, ee21607, ee92331, ef3422a, ef7600f, f256b4d, f7cf853, fd66af5, ff2deb1, ffc9089
- Review pass 1 by claude-reviewer-subagent: 0 findings
