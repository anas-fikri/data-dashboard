---
id: T-pxnn
title: Kotak cari pintar di menu Tambah kolom filter
status: done
profile: strict
tags:
  - ui
created: "2026-10-23T01:28:45Z"
updated: "2026-10-23T13:37:38Z"
closed: "2026-10-23T13:37:38Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: f21a6ecbde85af8c204e98d04e3b0df5ae7e4abd
paths:
  - CHANGELOG.md
  - deploy/release.sh
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - package-lock.json
  - package.json
  - src/components/admin/users-status-filter.tsx
  - src/components/dashboards/add-filter-column-menu.tsx
  - src/components/grid/grid-period-picker.tsx
  - src/components/grid/sheet-grid.tsx
  - src/components/mapping/mapping-picker.tsx
  - src/components/ui/menu-search.tsx
  - src/components/ui/select.tsx
  - tests/e2e/filters.spec.ts
  - tests/e2e/sharing.spec.ts
  - tests/scripts/release.test.ts
  - tests/scripts/upgrade-gates.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-23T12:01:18Z"
      findings: 9
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-23T12:07:54Z"
      findings: 3
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-10-23T13:16:32Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 291211
    summary: |-
      …asetId":"t072mvl0cr2nds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792762251937,"service":"data-dashboard","host":"127.0.0.1","port":38109,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792762252014,"service":"data-dashboard","host":"127.0.0.1","port":40503,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792762252142,"service":"data-dashboard","host":"127.0.0.1","port":32885,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792762252262,"service":"data-dashboard","host":"127.0.0.1","port":44547,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792762266208,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792762281165,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792762281189,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792762281195,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792762281206,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  229 passed | 1 skipped (230)
            Tests  3083 passed | 10 skipped (3093)
         Start at  13:28:47
         Duration  194.84s (tests 83%, import 14%, transform 3%)

          Isolate  230 workers spawned · ~161ms startup each (spawn + environment, per file)
                   at least ~12.21s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.4.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-23T13:32:04Z"
    tree: 298a4dcad97b13a6f92f2474c2d5a0527439b82b3e60aa023ac4a252e8676efd
  commits:
    - 1b4b6f3
    - 238a69d
    - 30e4fd7
    - 6ba502f
    - 6c4bc8b
    - 8ce4cc3
    - 9b88ac2
    - a085d62
    - a19d688
    - aec3bbe
    - b75d6d8
    - d0d1fdf
    - d44e938
    - d97c497
    - e09fb33
    - e675445
    - f6049ca
    - f750d27
    - f9659c2
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-10-23T13:32:19Z"
    passed: true
    tree: 298a4dcad97b13a6f92f2474c2d5a0527439b82b3e60aa023ac4a252e8676efd
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 486 dirs visited, 2530 inodes visited, 1 Extract calls, 87.376722ms elapsed, 87.377336ms wall time
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
Setiap daftar pilihan punya kotak cari pintar (keputusan pemilik 2026-10-23; laporan: menu Tambah kolom filter di produksi tanpa smart search). Komponen dasar Select (ui/select.tsx) selalu berkotak cari — semua dropdown pilihan ikut; menu pilihan berbasis DropdownMenu memakai ui/menu-search (Tambah kolom filter, Pilih periode Lihat data, filter status pengguna); daftar Kolom yang ditampilkan di Lihat data diberi kotak cari. Menu aksi tidak.

## Acceptance criteria
- [x] Menu Tambah kolom filter dengan ≥ 8 kolom punya kotak cari yang langsung fokus; pencarian pintar (src/lib/search: awalan, potongan, singkatan, inisial) menyaring kolom semua sheet dan menyorot huruf yang cocok
- [x] Keyboard: ketik menyaring, ↓ pindah ke hasil, Enter di kotak cari menambah hasil pertama yang bisa dipakai, Esc menutup; kolom yang sudah dipakai tetap tampil nonaktif dengan alasannya
- [x] Berlaku di bilah filter (Atur kolom filter) dan kartu Pengaturan dashboard
- [x] Semua daftar pilihan (Select, menu pilihan, daftar Kolom yang ditampilkan) punya kotak cari pintar; menu aksi tidak (keputusan pemilik 2026-10-23)

## Risk
Impact: semua Select di aplikasi (fokus awal pindah ke kotak cari; Enter kosong tidak mengganti nilai; ↓ ke pilihan saat ini). Security (STRIDE): hanya UI klien — tidak ada data, endpoint, atau hak akses baru; teks dirender sebagai teks React. Rollback: revert commit (tanpa migrasi). Validation: aitk check, e2e filters T-pxnn + sharing keyboard, suite e2e penuh per proyek, review 3 putaran (9 → 3 → 0); sisa non-blokir → T-yabt.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tanpa endpoint/aksi baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — teks kata kunci hanya disaring di klien, dirender sebagai teks React
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tanpa log/galat baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tanpa data baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa komunikasi baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tanpa API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa konfigurasi baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-23T13:32:04Z (291211 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 1b4b6f3, 238a69d, 30e4fd7, 6ba502f, 6c4bc8b, 8ce4cc3, 9b88ac2, a085d62, a19d688, aec3bbe, b75d6d8, d0d1fdf, d44e938, d97c497, e09fb33, e675445, f6049ca, f750d27, f9659c2
- Review pass 1 by claude-reviewer-subagent: 9 findings
- Review pass 2 by claude-reviewer-subagent: 3 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
