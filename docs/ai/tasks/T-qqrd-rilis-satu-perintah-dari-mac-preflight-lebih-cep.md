---
id: T-qqrd
title: Rilis satu perintah dari Mac + preflight lebih cepat dan aman
status: done
profile: strict
tags:
  - ops
created: "2026-10-23T11:51:15Z"
updated: "2026-10-23T15:02:02Z"
closed: "2026-10-23T15:02:02Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 4a32c9efaf5063b9b971924ea2fad51d649ff2b6
paths:
  - deploy/images.sh
  - deploy/release.sh
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - src/components/admin/users-status-filter.tsx
  - src/components/dashboards/add-filter-column-menu.tsx
  - src/components/grid/grid-period-picker.tsx
  - src/components/grid/sheet-grid.tsx
  - src/components/mapping/mapping-picker.tsx
  - src/components/shell/app-shell.tsx
  - src/components/ui/menu-search.tsx
  - src/components/ui/select.tsx
  - tests/e2e/filters.spec.ts
  - tests/e2e/sharing.spec.ts
  - tests/e2e/shell.spec.ts
  - tests/features/guides/markdown.test.ts
  - tests/scripts/release.test.ts
  - tests/scripts/upgrade-gates.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-23T14:48:26Z"
      findings: 3
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-23T14:51:42Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 273767
    summary: |-
      …us file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792767322452,"service":"data-dashboard","host":"127.0.0.1","port":46687,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792767335617,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792767335749,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nCan't reach database server at `127.0.0.1:5433`\n\nPlease make sure your database server is running at `127.0.0.1:5433`.","msg":"kuota pengguna tidak terbaca"}
      {"level":40,"time":1792767346713,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792767346736,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792767346740,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792767346751,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  227 passed | 3 skipped (230)
            Tests  3075 passed | 29 skipped (3104)
         Start at  14:53:25
         Duration  170.75s (tests 83%, import 14%, transform 3%)

          Isolate  230 workers spawned · ~153ms startup each (spawn + environment, per file)
                   at least ~11.57s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.4.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-23T14:56:18Z"
    tree: f1bf3f4ab9c46a4e70f7d0971159ad7aacb637a5ff4557aba9f5a5e1f0d150c9
  commits:
    - 083808b
    - 28a8b1a
    - 30e4fd7
    - 39adbb7
    - 4a32c9e
    - 4a9c1bc
    - 6c4bc8b
    - 8ce4cc3
    - 96102f2
    - a085d62
    - b75d6d8
    - c2d9cee
    - d44e938
    - d97c497
    - e785231
    - f3beaef
    - f6049ca
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-10-23T14:56:58Z"
    passed: true
    tree: f1bf3f4ab9c46a4e70f7d0971159ad7aacb637a5ff4557aba9f5a5e1f0d150c9
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 500 dirs visited, 2694 inodes visited, 1 Extract calls, 76.224239ms elapsed, 76.224768ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.4.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Pemilik merilis ke produksi dengan satu perintah dari Mac (`bash deploy/release.sh [--quick] [--seed …]`) tanpa mengatur waktu/urutan manual; preflight lebih cepat (pakai backup harian terverifikasi bila rilis tanpa migrasi) dan lebih aman (Redis sehat, ruang disk dari ukuran backup nyata).

## Acceptance criteria
- [x] deploy/release.sh menjalankan tag → build → kirim → preflight → git archive → load/migrate/start → seed panduan dengan satu koneksi SSH; berhenti di langkah pertama yang gagal (uji tests/scripts/release.test.ts)
- [x] upgrade.sh preflight: Redis wajib sehat, ruang disk dihitung dari ukuran arsip backup terakhir, REUSE_BACKUP_HOURS memakai backup terverifikasi yang baru (uji upgrade-gates)
- [x] Runbook §12 (Redis AOF rusak) dan §13 (rilis satu perintah)

## Risk
Impact: hanya skrip operasi (deploy/release.sh baru, deploy/upgrade.sh preflight, deploy/images.sh penanda -dirty) + runbook; kode aplikasi tidak berubah. Salah urutan/lanjutan bisa membuat produksi setengah ter-upgrade — dimitigasi: berhenti di langkah pertama yang gagal, produksi baru berubah setelah preflight (backup + dump) lulus, setiap galat sesudahnya mencetak perintah lanjutan yang tepat.
Security (STRIDE): Tampering — perintah jarak jauh hanya menyisipkan nilai tervalidasi (APP_DIR pola aman, slug --seed, angka FORCE/MIN_FREE_GB/BACKUP_EST_GB, nama migrasi [0-9a-z_], folder sementara mktemp berpola); image/kode/upgrade.sh semuanya dari tag (APP_COMMIT + ID arsip dicek). Information disclosure — tanpa rahasia di skrip/log; .env.prod tidak disentuh. Elevation — memakai akun SSH pemilik yang sama (tanpa sudo baru). DoS — satu koneksi SSH (ControlMaster) agar fail2ban tidak terpicu.
Rollback: rilis tanpa migrasi = IMAGE_TAG ke prev-<stamp> (runbook §11); dengan migrasi = upgrade.sh rollback (dump pra-upgrade). Skrip lama (§10/§11 manual) tetap bisa dipakai.
Validation: tests/scripts/release.test.ts (urutan, build dari worktree tag, preflight/load gagal, --quick, injeksi, variabel diteruskan) + upgrade-gates (Redis, disk, reuse vs migrasi, angka tidak sah); aitk check lulus; review subagen 2 putaran (3 → 0). Belum diuji ke server sungguhan: rilis pertama dipantau pemilik.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: skrip operasi deploy, tanpa permukaan aplikasi web/API/data pengguna yang berubah

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-23T14:56:18Z (273767 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 083808b, 28a8b1a, 30e4fd7, 39adbb7, 4a32c9e, 4a9c1bc, 6c4bc8b, 8ce4cc3, 96102f2, a085d62, b75d6d8, c2d9cee, d44e938, d97c497, e785231, f3beaef, f6049ca
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
