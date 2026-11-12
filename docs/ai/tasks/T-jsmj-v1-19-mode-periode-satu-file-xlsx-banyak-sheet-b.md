---
id: T-jsmj
title: 'v1.19: mode periode — satu file xlsx banyak sheet berkolom sama digabung ke satu sheet dataset (periode acak per baris)'
status: done
profile: standard
created: "2026-11-11T16:20:11Z"
updated: "2026-11-12T02:48:32Z"
closed: "2026-11-12T02:48:32Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 741a1556eeb4d17459d06a0358c5482de2b535af
paths:
  - CHANGELOG.md
  - content/panduan/15-data-per-periode.md
  - src/components/datasets/period-review-form.tsx
  - src/features/ingest/period-group.ts
  - src/features/ingest/period-ingest-repo.ts
  - src/features/ingest/period-ingest.ts
  - src/features/ingest/period-merge.ts
  - src/features/ingest/period-plan.ts
  - src/features/ingest/period-review.ts
  - src/features/ingest/period-upload-plan.ts
  - src/features/versions/period-commit.ts
  - src/features/versions/period-upload.ts
  - src/features/whats-new/entries.ts
  - tests/e2e/period-review.spec.ts
  - tests/features/ingest/period-ingest.test.ts
  - tests/features/ingest/period-merge.test.ts
  - tests/features/ingest/period-skip.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-12T01:53:02Z"
      findings: 2
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-12T02:05:10Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-12T02:13:04Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 182413
    summary: |-
      …an't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794451475705,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794451475728,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794451475730,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794451475741,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794451480006,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:100:40)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  253 passed | 1 skipped (254)
            Tests  3353 passed | 10 skipped (3363)
         Start at  02:42:52
         Duration  120.45s (tests 80%, import 17%, transform 3%)

          Isolate  254 workers spawned · ~99ms startup each (spawn + environment, per file)
                   at least ~8.31s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.18.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-12T02:44:53Z"
    tree: 20e665951575be129a22506c18eae82017d04cd7628607b163c2c6c2e2f60df3
  commits:
    - 10be0fe
    - 1777cf3
    - "2762863"
    - 280999b
    - 347467d
    - 441a240
    - "4850467"
    - 4a2e710
    - 56ac448
    - 5a2674d
    - 741a155
    - "76492e3"
    - 79246cf
    - 7ddd569
    - b43e7d6
    - ba29099
    - cb50be9
    - fd66af5
  acceptance:
    total: 5
    done: 5
  audit:
    at: "2026-11-12T02:44:54Z"
    passed: true
    tree: 20e665951575be129a22506c18eae82017d04cd7628607b163c2c6c2e2f60df3
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 551 dirs visited, 4759 inodes visited, 1 Extract calls, 101.364707ms elapsed, 101.36488ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.18.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Satu file xlsx dengan N sheet berkolom sama (mis. 7) diunggah ke dataset mode periode → semua baris semua sheet masuk ke satu sheet dataset, tidak ada IGNORED_SHEETS untuk sheet yang cocok
- [x] Periode tiap baris dari kolom tanggal (periode acak/bercampur antar sheet): setiap periode yang muncul di sheet mana pun diganti utuh oleh gabungan baris semua sheet (aturan kelompok file T-060)
- [x] Unggah file terpisah (antrean per periode dan kelompok satu periode) tetap berjalan seperti sekarang; gabungan sheet + beberapa file sekaligus jelas aturannya
- [x] Sheet berkolom beda tetap ditolak/diabaikan dengan pesan jelas; periode dari label (bukan kolom) → semua sheet = satu periode, dijelaskan di layar tinjauan
- [x] Tinjauan menampilkan sheet mana yang digabung; panduan 15 + Yang baru diperbarui; uji unit + e2e

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-11-11T16:20:12Z Permintaan pemilik 2026-11-11: dikerjakan setelah v1.18. Akar masalah: planSheets memasangkan tiap sheet dataset dengan tepat satu sheet file; sisanya IGNORED_SHEETS. Gabung sheet v1.16 (T-0gmm) hanya mode biasa.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-12T02:44:53Z (182413 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 10be0fe, 1777cf3, 2762863, 280999b, 347467d, 441a240, 4850467, 4a2e710, 56ac448, 5a2674d, 741a155, 76492e3, 79246cf, 7ddd569, b43e7d6, ba29099, cb50be9, fd66af5
- Review pass 1 by claude-reviewer-subagent: 2 findings
- Review pass 2 by claude-reviewer-subagent: 1 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
