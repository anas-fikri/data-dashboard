---
id: T-047
title: Tampilkan widget tabel layar penuh ('Perbesar') untuk viewer
status: in_progress
profile: standard
goal: G-6
tags:
  - ui
  - security
depends_on:
  - T-043
  - T-016
created: "2026-10-15T02:30:56Z"
updated: "2026-10-20T09:53:31Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 3b96186c740048dc57be0b9c7e8e5a3aae790889
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 192578
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792489956728,"service":"data-dashboard","host":"127.0.0.1","port":39019,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792489956787,"service":"data-dashboard","host":"127.0.0.1","port":33637,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792489956886,"service":"data-dashboard","host":"127.0.0.1","port":38593,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792489957024,"service":"data-dashboard","host":"127.0.0.1","port":41851,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792489965867,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792489976695,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792489976719,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792489976725,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792489976735,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  172 passed | 1 skipped (173)
            Tests  2224 passed | 10 skipped (2234)
         Start at  09:51:14
         Duration  135.90s (tests 84%, import 13%, transform 3%)

          Isolate  173 workers spawned · ~160ms startup each (spawn + environment, per file)
                   at least ~9.08s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T09:53:31Z"
    tree: f4b02d232717f0d77db0d3f0684596a3acb482d3ee270d97eea5fbc84b5954c6
  audit:
    at: "2026-10-20T09:49:47Z"
    passed: true
    tree: f4b02d232717f0d77db0d3f0684596a3acb482d3ee270d97eea5fbc84b5954c6
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 464 dirs visited, 2348 inodes visited, 1 Extract calls, 230.863561ms elapsed, 230.863857ms wall time
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
