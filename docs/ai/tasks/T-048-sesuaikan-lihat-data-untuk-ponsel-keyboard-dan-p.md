---
id: T-048
title: Sesuaikan Lihat data untuk ponsel, keyboard, dan pembaca layar
status: blocked
profile: standard
goal: G-6
tags:
  - ui
  - a11y
  - responsive
depends_on:
  - T-044
  - T-045
created: "2026-10-15T02:30:57Z"
updated: "2026-10-20T10:36:48Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 14bbbc800d5b469cd4253afc8ce888995fc4468d
paths:
  - package-lock.json
  - package.json
  - playwright.config.ts
  - src/app/globals.css
  - src/components/grid/grid-header.tsx
  - src/components/grid/sheet-grid.tsx
  - tests/e2e/data-view-a11y.spec.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T10:33:20Z"
      findings: 2
    - "n": 2
      by: claude-code
      at: "2026-10-20T10:33:20Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 181076
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792492527832,"service":"data-dashboard","host":"127.0.0.1","port":44731,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792492527892,"service":"data-dashboard","host":"127.0.0.1","port":44185,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792492527998,"service":"data-dashboard","host":"127.0.0.1","port":40419,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792492528113,"service":"data-dashboard","host":"127.0.0.1","port":45859,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792492536793,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792492549120,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792492549143,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792492549147,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792492549160,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  172 passed | 1 skipped (173)
            Tests  2224 passed | 10 skipped (2234)
         Start at  10:34:11
         Duration  129.67s (tests 84%, import 13%, transform 3%)

          Isolate  173 workers spawned · ~151ms startup each (spawn + environment, per file)
                   at least ~8.53s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T10:36:22Z"
    tree: 1f535cd1c6a2a965c6a52cb0256b0f7a8e2d6371cb8949bc93ddae9ec29c29af
  commits:
    - 08ca5b4
    - 0cb153a
    - "1220871"
    - 14bbbc8
    - 17d81a7
    - 18b74cc
    - 1b2b9ab
    - 23e5ae9
    - 258a139
    - 27924c4
    - 27986dc
    - 29fe0f3
    - 2d7b316
    - 3602b55
    - 36afc9f
    - 3b96186
    - 3bb3baa
    - 49f49a5
    - 4bd9881
    - 4eea84c
    - 5101f51
    - 5603fc7
    - 56a8447
    - 56e4d6d
    - 59ec9a3
    - "6123427"
    - 62ec216
    - 69b8953
    - 6b3ee3f
    - 70136f5
    - "7187327"
    - 75cf456
    - 76e3ce7
    - "7824e56"
    - 7ae2840
    - 7af4484
    - 7f238c4
    - 7f9a7c7
    - "8570e80"
    - 8f8df38
    - 8fc3abc
    - 90e4e63
    - "9298e14"
    - 930dd6d
    - 94bea50
    - 94d85a4
    - a019f8f
    - a03481c
    - a0e1646
    - a687d4c
    - acb27a6
    - ae4e5a2
    - af1994a
    - b0b99d8
    - b30aea5
    - b32d50d
    - b8e59ee
    - b933279
    - ba2efef
    - c15362c
    - c1c8b0a
    - c2fd95c
    - c76c343
    - ccd0a9a
    - ce26ca5
    - ce5d6a7
    - ce649d0
    - cf28ad3
    - d32a8ea
    - d557c9e
    - da46e35
    - dff9b8c
    - e24e070
    - e51fcb4
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - fc288cb
    - fc87996
  acceptance:
    total: 3
    done: 2
  audit:
    at: "2026-10-20T10:36:23Z"
    passed: true
    tree: 1f535cd1c6a2a965c6a52cb0256b0f7a8e2d6371cb8949bc93ddae9ec29c29af
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 470 dirs visited, 2431 inodes visited, 1 Extract calls, 209.001237ms elapsed, 209.001571ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@0.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md P-16 (Fase 2, §3.7–3.8): "Lihat data"
dipakai nyaman di ponsel (< 768 px: tanpa gulir horizontal, hanya nomor baris beku, toolbar dilipat ke
"Lainnya", urut/saring di lembar bawah, ketuk sel = Isi sel, target sentuh ≥ 44 px), sepenuhnya lewat
keyboard dengan fokus terlihat, dan terbaca pembaca layar (semantik grid ARIA, status memuat diumumkan,
axe tanpa pelanggaran serius). Bawaan review T-045: aria-selected pada baris terpilih. Tanpa perubahan
server/otorisasi (kontrak T-016/T-017 tidak tersentuh).

## Acceptance criteria
- [x] Given lebar 360 px, then halaman tidak bergulir horizontal, hanya nomor baris yang beku, toolbar terlipat ke 'Lainnya', urut/saring di bottom sheet, ketuk sel membuka isi penuh, dan target sentuh ≥ 44 px
- [x] Given hanya keyboard, then panah, Tab, PageUp/Down, Home/End, Ctrl+Home/End, Alt+↓, F2/Enter, Ctrl+F, dan Shift+Spasi berfungsi dengan fokus terlihat
- [ ] Given axe dan NVDA/VoiceOver, then role=grid, aria-rowcount = total + 1, aria-colcount, dan aria-rowindex nyata terpasang, status memuat diumumkan, axe tanpa pelanggaran serius, dan /frontend-expert:audit tanpa Critical/High

## Risk
Impact: hanya klien grid Lihat data (sheet-grid.tsx, grid-header.tsx, globals.css); chunk grid 291,8 / 293 KiB
(sebelumnya 290,6). End/Home tanpa pengubah kini bergerak dalam baris (dulu AG: ke baris terakhir/pertama).
Security (STRIDE): tidak ada endpoint/aksi server baru; axe-core hanya devDependency e2e (MPL-2.0, sudah ada
transitif lewat eslint-plugin-jsx-a11y). Rollback: revert commit T-048 (tanpa migrasi/data).
Validation: e2e data-view-a11y 3/3 + regresi data-view 8, data-view-query 4, data-view-copy 4,
data-view-export 4, data-view-scroll 7×3 engine; aitk check hijau; measure-grid-chunk 291,8 KiB.

## Notes
**Dikerjakan (2026-10-20, claude-code cloud)**
- Ponsel (< 768 px, matchMedia): kolom data dilepas dari beku (pembekuan desktop tetap disimpan dan pulih
  saat kembali lebar), geser kolom mati, baris 45 px (sel ≥ 44 px), tombol menu kolom 44 px, menu kolom
  (urut/saring) jadi lembar bawah selebar layar dengan item 44 px, "Ke baris"/"Unduh tampilan"/"Kolom"/
  "Desimal salinan" dilipat ke lembar "Lainnya", ketuk sel data → panel Isi sel (dengan "Salin isi").
  Dialog saring dan panel Isi sel sudah lembar bawah sejak T-044/T-045.
- Keyboard: Home/End = sel pertama/terakhir di baris (pola grid WAI-ARIA; bawaan AG melompat ke baris
  terakhir dan mendarat di sentinel); tombol lain sudah ada (T-043–T-045) dan kini diuji bersama; cincin
  fokus 2px token --ring juga di kepala kolom.
- ARIA: aria-selected pada elemen baris (beku + tengah) lewat processRowPostCreate + saat pilihan berubah,
  aria-multiselectable pada grid; pengumuman "Memuat baris a–b…" untuk blok terlihat yang > 500 ms, lalu
  "Baris a–b dimuat". Kontras nomor baris diperbaiki (muted-foreground di atas muted 4,39:1 → foreground).
- axe: axe-core 4.14.0 (devDependency langsung; versi sama dengan yang sudah terkunci transitif, lockfile
  disunting tangan 1 baris) disuntik lewat page.evaluate (CSP nonce tidak menghalangi); tanpa pelanggaran
  serius/kritis di desktop (grid + pilihan, dialog saring, panel Isi sel) dan 360 px (grid, lembar Lainnya,
  setelah urut/saring/Isi sel).
- Bukti: tests/e2e/data-view-a11y.spec.ts (project data-view-a11y) 3/3.

**Asumsi/keputusan**
- aria-rowcount tetap total + 2 (header + sentinel "Akhir data") sesuai ADR-0007 yang menerima keputusan itu
  setelah rencana ditulis (rencana/AC menulis total + 1). Menambal atribut AG ke total + 1 membuat sentinel
  ber-aria-rowindex di luar aria-rowcount. Bila pemilik tetap mau total + 1, perlu task lanjutan untuk
  mengganti sentinel (mis. penanda di luar grid) dan mengukur ulang mitigasi gulir ADR-0007.
- Pemberitahuan sekali "Tampilan terbaik di layar ≥ 1024 px" ditulis statis di lembar Lainnya (bukan toast).
- Resize kolom tidak dimatikan di ponsel (gagang AG kecil; tidak ada di AC).

**Belum bisa diverifikasi di lingkungan ini (AC3 sengaja tidak dicentang)**
- `/frontend-expert:audit`: plugin frontend-expert tidak tersedia di sesi cloud → jalankan dari Mac
  pemilik pada halaman /datasets/<id>/data (desktop + 360 px); target tanpa Critical/High.
- Smoke test pembaca layar (pemilik):
  1. NVDA 2024+ + Firefox/Chrome di Windows: buka Lihat data dataset ≥ 450 baris. Tab ke grid → NVDA
     mengumumkan "Data sheet <nama>, grid, <total+2> baris, <n> kolom". Panah ke kanan/bawah: tiap sel
     dibacakan dengan nama kolom + nomor baris. Ctrl+End: "Memuat baris …" lalu "Baris … dimuat"/nilai
     sel terakhir. Shift+Spasi: baris diumumkan terpilih ("dipilih"). Alt+↓: dialog "Saring kolom …".
     F2: dialog "Isi sel …". Escape kembali ke sel. Kepala kolom terurut membaca "diurutkan naik/turun".
  2. VoiceOver (macOS Safari): VO+Shift+↓ masuk grid, ulangi langkah 1 (Ctrl+Home/End, Shift+Spasi,
     Alt+↓, F2). VoiceOver iOS (iPhone, Safari): geser untuk menelusuri sel, ketuk dua kali sel → Isi sel,
     tombol "Lainnya" dan menu kolom terbaca sebagai tombol/menu.
  Catat hasil (lulus/temuan) di task ini; temuan → task lanjutan.


## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: perubahan hanya klien grid; batas kepercayaan tetap di Route Handler sheet (T-041) yang tidak diubah
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: tidak ada endpoint/aksi baru; halaman tetap requireUser + gridPageView (viewer 404, diuji data-view.spec)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: tidak ada input baru ke server; 'Ke baris' tetap parseRowInput dan dijepit ke total
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat/log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: tidak ada data baru disimpan; localStorage tetap hanya pengaturan kolom (pembekuan desktop)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: axe-core 4.14.0 (Deque, MPL-2.0) hanya devDependency e2e, versi yang sudah terkunci transitif; tidak dikirim ke bundle produksi
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak ada alur bisnis baru (urut/saring/salin memakai jalur yang sama)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: CSP tidak diubah (axe disuntik hanya di e2e lewat CDP); npm audit hijau

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T10:36:22Z (181076 ms)
- Acceptance criteria: 2/3 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 3602b55, 36afc9f, 3b96186, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 5603fc7, 56a8447, 56e4d6d, 59ec9a3, 6123427, 62ec216, 69b8953, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7f238c4, 7f9a7c7, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9298e14, 930dd6d, 94bea50, 94d85a4, a019f8f, a03481c, a0e1646, a687d4c, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b8e59ee, b933279, ba2efef, c15362c, c1c8b0a, c2fd95c, c76c343, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, d32a8ea, d557c9e, da46e35, dff9b8c, e24e070, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 2 findings
- Review pass 2 by claude-code: 0 findings
