---
id: T-w764
title: 'Perbaiki e2e kpi-fit halaman cetak: angka KPI noted w4 terpotong 1 px'
status: in_progress
profile: standard
created: "2026-10-21T12:34:26Z"
updated: "2026-10-21T21:12:54Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 62dfa2b97043bf3ab0c4429f296d7bc00fdb08ee
evidence:
  check:
    cmd: npm run check
    exit_code: 2
    duration_ms: 61753
    summary: |-
      > data-dashboard@1.2.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@1.2.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@1.2.0 typecheck
      > tsc --noEmit

      tests/components/kpi-line-height.test.ts(14,25): error TS2769: No overload matches this call.
        The last overload gave the following error.
          Property 'key' is missing in type '{ label: string; type: "decimal"; }' but required in type 'QueryColumn'.
    at: "2026-10-21T21:12:29Z"
    tree: 424dfc2cc41eaece461923384d6bf28e9f904118e2cce0c4fbfb93e547f89c99
  check_failures: 1
  audit:
    at: "2026-10-21T21:12:30Z"
    passed: true
    tree: 424dfc2cc41eaece461923384d6bf28e9f904118e2cce0c4fbfb93e547f89c99
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5219 inodes visited, 1 Extract calls, 242.19742ms elapsed, 242.197731ms wall time
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
Ditemukan saat T-1zdf (gagal konsisten di HEAD 8ce72cf, 4/4 run): tests/e2e/kpi-fit.spec.ts "AC1: halaman cetak (viewport renderer 1047 px, media print)" — angka KPI kartu bercatatan w4 terpotong 1 px di bawah (28 px, kotak @container KPI), toleransi 0,5 px. Tentukan apakah ini bug nyata (kpiHeightPx/ukuran huruf di halaman cetak) lalu perbaiki dengan tes regresi; jangan melonggarkan toleransi.

## Acceptance criteria
- [x] Given project kpi-fit dijalankan utuh, then tes AC1 halaman cetak lulus (potongan angka <= 0,5 px) tanpa melonggarkan toleransi

## Risk
Impact: tinggi baris angka KPI kini benar-benar leading-tight (1,25) di layar dan kertas (sebelumnya 1,5
karena kelasnya terbuang); angka sedikit lebih rapat ke label, ukuran huruf tidak berubah.
Security (STRIDE): tidak ada permukaan baru (hanya urutan kelas CSS).
Rollback: revert commit T-w764.
Validation: tests/components/kpi-line-height.test.ts (gagal sebelum perbaikan); e2e --project=kpi-fit 6/6
(cetak: potongan 0 px), pdf, widgets.

## Notes
- Diagnosis T-075 (2026-10-21, belum diperbaiki): direproduksi (--project=kpi-fit, 5 lulus, AC1 cetak
  gagal: "angka noted w4 terpotong (28 px, bawah @container …)", potongan 1 px > 0,5). Kotak yang
  memotong = kotak KPI (kpi-view.tsx, overflow-hidden, pb-3). Ukuran 28 px berasal dari batas tinggi
  `kpiHeightPx` (kpi-fit.ts: angka boleh memakai padding bawah kecuali 2 px ekor huruf, tinggi baris
  leading-tight 1,25). Dugaan: kotak isi teks (Range) font halaman cetak lebih tinggi dari 1,25 em
  sehingga cadangan 2 px kurang ± 1 px; perlu ukur ascent/descent font di halaman cetak lalu ubah rumus
  (mis. cadangan dari metrik font, bukan konstanta) + uji unit kpiHeightPx — jangan longgarkan toleransi.
- Akar masalah (T-w764, 2026-10-21): bukan metrik font (Inter: kotak isi 34 px < baris 35 px di 28 px).
  Pengukuran di halaman cetak: tinggi <p> angka 42 px = 1,5 × 28 — `cn()` (tailwind-merge) membuang
  `leading-tight` karena kelas ukuran `text-[clamp(...)]`/`text-sm` sesudahnya (text-* membawa tinggi
  baris), jadi tinggi baris jatuh ke 1,5 warisan body sementara kpiHeightPx menganggap 1,25 → kotak teks
  turun 3,5 px dan terpotong 1 px. Perbaikan: `leading-tight` ditaruh sesudah kelas ukuran (kpi-view.tsx).
  Sesudahnya tinggi <p> 35 px, potongan 0 px di semua kartu; toleransi tidak diubah.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya urutan kelas CSS angka KPI; tidak ada input, data, endpoint, atau konfigurasi baru.
