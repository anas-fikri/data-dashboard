---
id: T-aw7d
title: Pembersihan image lama otomatis setelah upgrade sukses
status: done
profile: strict
created: "2026-11-08T01:40:25Z"
updated: "2026-11-08T02:12:51Z"
closed: "2026-11-08T02:12:51Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 696c3707868f2cdab09357ff2997f7f4a8200c49
paths:
  - CHANGELOG.md
  - content/panduan/06-susun-dashboard.md
  - content/panduan/13-widget-pivot.md
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - src/app/globals.css
  - src/components/dashboards/bound-config.tsx
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/dashboard-colors-control.tsx
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/status-fields.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/render/print-card.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/dashboard-colors.tsx
  - src/components/widgets/widget-body.tsx
  - src/features/whats-new/entries.ts
  - src/features/widgets/spec.ts
  - src/features/widgets/status-color.ts
  - src/features/widgets/tone.ts
  - tests/components/tone-options.test.ts
  - tests/e2e/chart-theme.spec.ts
  - tests/features/widgets/palette-contrast.test.ts
  - tests/features/widgets/status-color.test.ts
  - tests/features/widgets/tone-schema.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-08T01:56:07Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-08T02:12:44Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 141266
    summary: |-
      …ost":"127.0.0.1","port":40171,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794103356455,"service":"data-dashboard","host":"127.0.0.1","port":43803,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794103356550,"service":"data-dashboard","host":"127.0.0.1","port":33769,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794103356656,"service":"data-dashboard","host":"127.0.0.1","port":45967,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794103359366,"service":"data-dashboard","datasetId":"t072mw76tf9nds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794103369101,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794103371483,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794103371505,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794103371508,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794103371520,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  239 passed | 1 skipped (240)
            Tests  3189 passed | 10 skipped (3199)
         Start at  02:01:35
         Duration  98.50s (tests 81%, import 16%, transform 3%)

          Isolate  240 workers spawned · ~81ms startup each (spawn + environment, per file)
                   at least ~6.41s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.10.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-08T02:03:14Z"
    tree: ac7ca84e0cd2755eb7db04eb36abac09874008d14ea9c4acff204ed719cbba18
  commits:
    - 022c31b
    - 428de0e
    - 491b443
    - 6a79470
    - 6da3590
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-11-08T02:03:15Z"
    passed: true
    tree: ac7ca84e0cd2755eb7db04eb36abac09874008d14ea9c4acff204ed719cbba18
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 516 dirs visited, 2965 inodes visited, 1 Extract calls, 232.734398ms elapsed, 232.73453ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.10.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Setelah upgrade produksi lulus verifikasi, upgrade.sh menghapus image dashboard-* rilis lama secara otomatis (menyisakan rilis aktif, image rollback upgrade terakhir, :latest, dan image yang dipakai container) agar disk olympus tidak penuh tiap rilis; perintah manual prune-images; runbook §20.

## Acceptance criteria
- [x] Given start lulus verifikasi, when selesai, then tag dashboard-* lama dihapus kecuali IMAGE_TAG aktif, prev-<STAMP> terakhir, :latest, dan image yang dipakai container
- [x] Given IMAGE_TAG kosong atau daftar container gagal dibaca, when prune-images, then batal tanpa menghapus apa pun

## Risk
Impact: skrip upgrade produksi di VM bersama (olympus) menghapus image dashboard-* lama setelah start lulus verifikasi. Security (STRIDE): Tampering/DoS — salah hapus image aplikasi lain atau image rollback dicegah: filter nama tepat dashboard-{app,worker,renderer,backup}, pengecualian IMAGE_TAG aktif + prev-<STAMP> + :latest + image yang dipakai container, docker rmi tanpa -f/prune, IMAGE_TAG divalidasi pola ketat, berhenti bila docker ps gagal. Rollback: rollback cepat tetap memakai prev-<STAMP> upgrade terakhir; rilis lebih lama = restore backup/build ulang (runbook §20). Validation: stub docker (8 skenario termasuk IMAGE_TAG kosong, image dipakai container, rmi ditolak, aplikasi lain), bash -n, review subagen 0 blocking.

## Notes

- 2026-11-08T01:56:07Z Bukti: stub docker — tag lama dihapus, v1.10.0/prev-<STAMP>/image dipakai container/aplikasi lain/<none> utuh, rmi ditolak dilaporkan; IMAGE_TAG kosong → GAGAL tanpa rmi; review subagen 0 blocking (Low: docker ps gagal → die, :latest dipertahankan — diterapkan).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: skrip pemilik di VM; hanya memanggil docker CLI lokal
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak disentuh perubahan ini
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — IMAGE_TAG divalidasi ^[A-Za-z0-9][A-Za-z0-9._-]*$, nama image difilter pola ketat dan di-quote (tanpa injeksi)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — pesan galat tanpa rahasia; .env.prod hanya dibaca IMAGE_TAG
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — hanya setelah VERIFIED_AT; subshell sehingga kegagalan tidak membatalkan upgrade; PRUNE_IMAGES=0 untuk melewati
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak disentuh perubahan ini
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa docker prune/-f (default aman)

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-08T02:03:14Z (141266 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 022c31b, 428de0e, 491b443, 6a79470, 6da3590
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
