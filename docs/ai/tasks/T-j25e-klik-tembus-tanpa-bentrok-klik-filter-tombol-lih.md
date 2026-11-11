---
id: T-j25e
title: 'Klik-tembus tanpa bentrok klik-filter: tombol Lihat baris data untuk kategori terpilih'
status: done
profile: strict
tags:
  - widgets
created: "2026-11-11T02:18:55Z"
updated: "2026-11-11T03:25:48Z"
closed: "2026-11-11T03:25:48Z"
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
      at: "2026-11-11T02:45:40Z"
      findings: 4
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-11T02:47:32Z"
      findings: 2
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-11T02:48:19Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 178330
    summary: |-
      …asetId":"t072mwbjy5eeds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794367280292,"service":"data-dashboard","host":"127.0.0.1","port":43735,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794367280343,"service":"data-dashboard","host":"127.0.0.1","port":46047,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794367280438,"service":"data-dashboard","host":"127.0.0.1","port":45195,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794367280556,"service":"data-dashboard","host":"127.0.0.1","port":36487,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794367289366,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794367299626,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794367299648,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794367299652,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794367299663,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  244 passed | 1 skipped (245)
            Tests  3270 passed | 10 skipped (3280)
         Start at  03:19:59
         Duration  118.20s (tests 80%, import 17%, transform 3%)

          Isolate  245 workers spawned · ~104ms startup each (spawn + environment, per file)
                   at least ~8.36s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.15.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-11T03:21:58Z"
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
    at: "2026-11-11T03:22:17Z"
    passed: true
    tree: 54ed2ab0070577ffb5f5b1c67c533fa7ed85a51be6c66cd810674586dee39234
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 544 dirs visited, 3774 inodes visited, 1 Extract calls, 499.472996ms elapsed, 499.473163ms wall time
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
Masukan pemilik setelah v1.15.0: klik-tembus terasa tidak berfungsi dan bentrok dengan klik-filter; pemilik ingin klik satu kali pada grafik tetap mengaktifkan filter silang. Alur baru: klik kategori = filter silang (seperti sebelum v1.15); bila grafik punya klik-tembus, bilah kecil di atas grafik menampilkan petunjuk lalu tombol "Lihat baris data “<kategori>”" untuk kategori yang sedang dipilih (keyboard: tombol yang sama). Grafik yang filter silangnya dimatikan: klik langsung membuka baris. Data, D6, dan dialog baris tidak berubah.

## Acceptance criteria
- [x] Given grafik dengan klik-tembus dan filter silang aktif, when user mengklik kategori (atau Enter pada kategori di tabel data grafik), then kategori menjadi filter silang seperti biasa dan tidak membuka dialog
- [x] Given kategori dari grafik itu sedang dipilih, when user menekan tombol 'Lihat baris data “<kategori>”' di atas grafik, then dialog baris kategori itu terbuka (fokus kembali ke tombol saat ditutup); tanpa pilihan, bilah menampilkan petunjuk
- [x] Given filter silang widget dimatikan, when user mengklik kategori, then dialog baris langsung terbuka (tanpa bilah)
- [x] Given panduan dan halaman Yang baru, when dibaca, then menjelaskan alur tombol Lihat baris data

## Risk
Impact: hanya UI klien — src/components/widgets/chart-widget.tsx (klik = filter silang, bilah Lihat baris data, mode langsung), chart-table.tsx, drill-dialog.tsx (fallbackFocus), config-sections.tsx (teks DrillField), globals.css (petunjuk disembunyikan di mode TV); panduan 06/09, Yang baru. Server, D6, dan /api/query tidak berubah.
Security (STRIDE): tidak ada jalur data baru — dialog memakai permintaan klik-tembus v1.15.0 yang sama (server membangun klausa dari dimensi widget, kolom drill.columns saja); tombol hanya memicu permintaan yang sudah ada.
Rollback: revert commit/image ke v1.15.0 (klik grafik membuka dialog lagi); tanpa migrasi.
Validation: tests/components/drill.test.ts, e2e kpi-drill (4/4), chart-polish, dashboard-flex; review subagen 3 putaran → 0.

## Notes

- 2026-11-11T03:18:53Z Bukti: tests/components/drill.test.ts (filter silang + tombol Lihat baris data, petunjuk tanpa pilihan, mode langsung saat filter silang mati), e2e kpi-drill (klik → filter 41, Lihat baris data → 4 baris, Esc fokus ke tombol, Lepas saringan → fokus ke bilah, filter silang mati → klik langsung membuka baris, ponsel + axe, viewer). Panduan 06/09 + Yang baru 1.15. Suite e2e per proyek: 39/41 lulus; data-view-a11y AC2 gagal juga di v1.14 (T-7377); mapping (period-mapping AC2 timeout) lulus 7/7 saat diulang. E2E terarah di kode akhir d6d31c9: kpi-drill 4/4, chart-polish 9/9, dashboard-flex 4/4. Review subagen: T-xp28 2 putaran → 0, T-j25e 3 putaran → 0. Vitest 3270 lulus.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: tidak disentuh perubahan ini
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Akses tidak berubah: dialog memakai /api/query widget yang sama (authorize widget + D6) seperti v1.15.0.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Tidak ada input baru ke server; nilai kategori tetap divalidasi server (drillClause).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Endpoint tidak berubah (cek Origin, rate limit RULES.query, batas body).
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-11T03:21:58Z (178330 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 1892c10, 19af165, 202826f, 2472318, 51fa41a, 63a7f03, c5f372b, d6d31c9, e82f68a
- Review pass 1 by claude-reviewer-subagent: 4 findings
- Review pass 2 by claude-reviewer-subagent: 2 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
