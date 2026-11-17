---
id: T-se9h
title: 'Skema warna: tema membawa warna level; level tinggi/normal/rendah otomatis aktif bawaan (arah makin tinggi makin baik),…'
status: in_progress
profile: standard
created: "2026-11-17T07:28:08Z"
updated: "2026-11-17T08:18:41Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 115d670758b76a83a203fa455ed07dd50760fe52
evidence:
  audit:
    at: "2026-11-17T08:14:48Z"
    passed: true
    tree: 281158583044802876ef8c0deb61878564872490d55c019a13f04fd7b0b03d7d
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 559 dirs visited, 6165 inodes visited, 1 Extract calls, 115.672055ms elapsed, 115.672269ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.22.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Level tinggi/sedang/rendah aktif otomatis di semua dashboard: penilaian bawaan dashboard yang belum diatur = 'makin tinggi makin baik'; dashboard bisa memilih 'Tanpa warna', widget tetap bisa membalik arah atau mematikan. Warna level mengikuti tema grafik bila template status belum dipilih (Ramah buta warna → biru–oranye; tema bersaturasi tinggi → Tegas; lainnya → Lembut).

## Acceptance criteria
- [ ] Dashboard tanpa pengaturan: level otomatis aktif (makin tinggi makin baik)
- [ ] Dashboard bisa memilih Tanpa warna; widget bisa membalik/mematikan
- [ ] Warna level ikut tema grafik bila template belum dipilih; pilihan template sendiri menang

## Risk
Impact: tampilan semua dashboard lama berubah (nilai yang belum punya penilaian kini berwarna) — disetujui pemilik. Security (STRIDE): tanpa perubahan akses; skema tone dashboard menerima 'none' (enum tetap). Rollback: image sebelumnya; dashboard yang menyimpan tone 'none' akan ditolak skema versi lama → warna dashboard itu dibaca tidak valid (cek pembacaan) — risiko kecil, catat di runbook. Validation: uji unit tone-schema, e2e status-colors, chart-theme, kpi-drill.

## Notes
