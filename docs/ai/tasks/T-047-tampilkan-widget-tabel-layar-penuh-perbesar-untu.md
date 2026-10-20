---
id: T-047
title: Tampilkan widget tabel layar penuh ('Perbesar') untuk viewer
status: done
profile: strict
goal: G-6
tags:
  - ui
  - security
depends_on:
  - T-043
  - T-016
created: "2026-10-15T02:30:56Z"
updated: "2026-10-20T09:58:42Z"
closed: "2026-10-20T09:58:42Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 3b96186c740048dc57be0b9c7e8e5a3aae790889
paths:
  - src/app/(app)/datasets/[id]/data/page.tsx
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/widget-card-head.tsx
  - src/components/dashboards/widget-card.tsx
  - src/components/widgets/table-expand.tsx
  - src/components/widgets/table-view.tsx
  - src/features/query/grid-page.ts
  - tests/components/table-expand.test.ts
  - tests/e2e/data-view.spec.ts
  - tests/features/query/grid-page.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T09:55:01Z"
      findings: 3
    - "n": 2
      by: claude-code
      at: "2026-10-20T09:55:02Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 193821
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792490236541,"service":"data-dashboard","host":"127.0.0.1","port":34615,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792490236595,"service":"data-dashboard","host":"127.0.0.1","port":40789,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792490236698,"service":"data-dashboard","host":"127.0.0.1","port":39389,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792490236810,"service":"data-dashboard","host":"127.0.0.1","port":46725,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792490246751,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792490253037,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792490253058,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792490253062,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792490253072,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  172 passed | 1 skipped (173)
            Tests  2224 passed | 10 skipped (2234)
         Start at  09:55:58
         Duration  136.14s (tests 84%, import 13%, transform 3%)

          Isolate  173 workers spawned · ~158ms startup each (spawn + environment, per file)
                   at least ~8.93s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T09:58:16Z"
    tree: f4b02d232717f0d77db0d3f0684596a3acb482d3ee270d97eea5fbc84b5954c6
  commits:
    - 0cb153a
    - "1220871"
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
    done: 3
  audit:
    at: "2026-10-20T09:58:17Z"
    passed: true
    tree: f4b02d232717f0d77db0d3f0684596a3acb482d3ee270d97eea5fbc84b5954c6
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 468 dirs visited, 2385 inodes visited, 1 Extract calls, 273.594046ms elapsed, 273.594501ms wall time
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
Rencana G-6 P-15 (§3.1, Q9, R11): tombol "Perbesar" pada widget tabel di dashboard membuka tabel layar
penuh bergaya lembar kerja (nomor baris beku, garis sel, kepala lengket, halaman + urut satu kolom) untuk
semua peran. Data tetap lewat jalur widget `/api/query {widgetId, dashboardFilters, page, sort}` (D6:
viewer hanya kolom widget, tanpa endpoint sheet, tanpa AG Grid di rute dashboard). Pemilik/editor
mendapat tautan "Buka di Lihat data" ke sheet widget (`/datasets/:id/data?sheetId=`); viewer tidak, dan
URL Lihat data/endpoint sheet tetap menolak viewer tanpa nama kolom.

## Acceptance criteria
- [x] Given viewer dashboard bersama, when 'Perbesar' pada widget tabel, then tabel layar penuh bergaya lembar kerja memakai /api/query {widgetId, dashboardFilters, page, sort} yang sama, hanya dengan kolom widget, tanpa tautan Lihat data
- [x] Given viewer membuka URL Lihat data atau endpoint sheet secara langsung, then ditolak tanpa menampilkan nama kolom tersembunyi atau lama
- [x] Given pemilik/editor, when 'Perbesar', then tersedia tautan 'Buka di Lihat data'

## Risk
- Impact: UI dashboard (kepala kartu tabel mode lihat + dialog baru), varian `sheet` TableView (kartu
  biasa tidak berubah), halaman Lihat data menerima `?sheetId=` (cuid, dicocokkan hanya ke tab versi
  aktif; tak dikenal → sheet pertama). Tidak ada endpoint/API baru; otorisasi /api/query dan
  /api/sheets tidak disentuh.
- Security (STRIDE): Information disclosure — dialog memakai body widget yang sama (kunci ⊆ widgetId,
  dashboardFilters, page, sort; diuji e2e), jadi kolom di luar widget tidak pernah dikirim; tautan Lihat
  data hanya dirender bila peran ≠ VIEWER (server tetap menolak: halaman 404, endpoint 403 tanpa nama).
  Elevation — `sheetId` di URL hanya memilih tab di antara sheet versi aktif dataset yang sudah lolos
  cek peran. Tampering/Spoofing/Repudiation/DoS: N/A — tidak ada jalur tulis atau beban baru di luar
  query widget yang sudah dibatasi rate/antrian.
- Rollback: revert commit fitur; tanpa migrasi atau data.
- Validation: e2e data-view (T-047 AC1–AC3 + Akses), unit table-expand/grid-page, `aitk check`,
  `node scripts/measure-grid-chunk.mjs` (290,6 KiB ≤ 293, leakedToDashboard []).

## Notes
- Komponen: `src/components/widgets/table-expand.tsx` (Dialog Radix layar penuh, state halaman/urut
  sendiri, mulai dari halaman/urut kartu; filter dashboard berubah → halaman 1), `TableView` prop
  `sheet`, tombol di `widget-card.tsx` (mode lihat, tabel saja; mengalah di kartu < 9,5rem / < 11rem
  sentuh, `NARROW_VIEW.expandHide`).
- Plugin frontend-expert tidak tersedia di sesi cloud ini — rantai skill + `/frontend-expert:audit`
  belum dijalankan; dicek manual dari tangkapan layar trace e2e (1280×800). Ponsel/forced-colors belum
  dicek visual (T-048 menangani ponsel/keyboard/pembaca layar Lihat data).
- Bukti: e2e `data-view` -g "T-047|Akses" 4/4 (AC1 viewer: kolom Kode/Jumlah saja, nomor baris 1/101,
  halaman 2, urut Jumlah turun → K450, body /api/query hanya kunci widget, 0 panggilan /api/sheets, tidak
  ada nama kolom lain di jawaban; AC2 viewer: /datasets/:id/data?sheetId → 404, rows/values/stats/cell →
  403 tanpa nama kolom; AC3 editor + pemilik: tautan "Buka di Lihat data" → grid K1). Unit
  table-expand 3, grid-page 5. measure-grid-chunk: totalKiB 290,6, leakedToDashboard [].

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: batas kepercayaan tetap /api/query (D6) untuk dialog; Lihat data/endpoint sheet tidak berubah
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi (requireUser tetap di halaman/route)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: viewer tanpa tautan; halaman Lihat data 404 dan rows/values/stats/cell 403 untuk viewer (e2e AC2); ?sheetId hanya memilih di antara tab versi aktif setelah cek peran
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: ?sheetId divalidasi isIdShape; body widget divalidasi zod strict yang sudah ada; teks sel dirender React (ter-escape)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data tersimpan baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: pesan galat dialog dari server (pesan umum untuk viewer, forRole T-016); tidak ada log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: dialog hanya menerima kolom widget (e2e: tidak ada nama kolom lain di jawaban /api/query)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru (package-lock tidak berubah)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: halaman/urut lewat batas TABLE_PAGE_MAX dan urut hanya kolom tabel (widgetPlan), tanpa jalur baru
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: tidak ada endpoint baru; kunci body /api/query ⊆ {widgetId, dashboardFilters, page, sort} (e2e)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi/header baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T09:58:16Z (193821 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 0cb153a, 1220871, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 3602b55, 36afc9f, 3b96186, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 5603fc7, 56a8447, 56e4d6d, 59ec9a3, 6123427, 62ec216, 69b8953, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7f238c4, 7f9a7c7, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9298e14, 930dd6d, 94bea50, 94d85a4, a019f8f, a03481c, a0e1646, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b8e59ee, b933279, ba2efef, c15362c, c1c8b0a, c2fd95c, c76c343, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, d32a8ea, d557c9e, da46e35, dff9b8c, e24e070, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-code: 0 findings
