---
id: T-045
title: Tambahkan panel Isi sel, salin ke Excel, dan ringkasan kolom
status: done
profile: strict
goal: G-6
tags:
  - ui
  - security
depends_on:
  - T-043
created: "2026-10-15T02:30:56Z"
updated: "2026-10-20T08:56:10Z"
closed: "2026-10-20T08:56:10Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 76e3ce7504baf66d6b263dfbee4c7691ee987336
paths:
  - playwright.config.ts
  - src/app/api/sheets/[id]/stats/route.ts
  - src/app/globals.css
  - src/components/grid/grid-cell-panel.tsx
  - src/components/grid/grid-copy.ts
  - src/components/grid/grid-fetch.ts
  - src/components/grid/sheet-grid.tsx
  - src/features/query/grid-http.ts
  - src/features/query/grid-service.ts
  - src/features/query/grid.ts
  - src/features/query/service.ts
  - tests/components/grid-copy.test.ts
  - tests/e2e/data-view-copy.spec.ts
  - tests/features/query/grid-http.test.ts
  - tests/features/query/grid.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T08:52:33Z"
      findings: 5
    - "n": 2
      by: claude-code
      at: "2026-10-20T08:52:34Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 188660
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792486488568,"service":"data-dashboard","host":"127.0.0.1","port":43645,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792486488623,"service":"data-dashboard","host":"127.0.0.1","port":39633,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792486488722,"service":"data-dashboard","host":"127.0.0.1","port":46265,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792486488833,"service":"data-dashboard","host":"127.0.0.1","port":34625,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792486496606,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792486509508,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792486509529,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792486509535,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792486509544,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  169 passed | 1 skipped (170)
            Tests  2198 passed | 10 skipped (2208)
         Start at  08:53:27
         Duration  134.04s (tests 85%, import 12%, transform 3%)

          Isolate  170 workers spawned · ~153ms startup each (spawn + environment, per file)
                   at least ~8.50s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T08:55:43Z"
    tree: 33decf5a74d9ca422a3b1e570893387a0a912b5e1cff9599a83bea8edcacb4cf
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
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - fc288cb
    - fc87996
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-10-20T08:55:44Z"
    passed: true
    tree: 33decf5a74d9ca422a3b1e570893387a0a912b5e1cff9599a83bea8edcacb4cf
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 456 dirs visited, 2241 inodes visited, 1 Extract calls, 234.617724ms elapsed, 234.61796ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-13, Fase 2 (§3.1 panel Isi sel + bilah status, §3.4 endpoint `stats`, §3.5 salin). Di halaman Lihat data: F2/Enter (atau klik ganda) membuka panel "Isi sel" berisi isi penuh, nilai asli bila gagal cast, dan sumber (file · baris · periode) dari GET …/cell (T-041); Ctrl/Cmd+C menyalin sel atau baris terpilih (nomor baris, Shift+klik/Shift+Spasi, ≤ 1.000) dalam bentuk yang dibaca Excel; kolom angka terfokus menampilkan Jumlah/Rata-rata/Min/Maks/Hitung atas seluruh baris tersaring lewat POST /api/sheets/:id/stats dengan ekspresi agregat widget KPI. Akses tetap pemilik/editor (authorize T-041); viewer tidak berubah (R21: kontrak T-016 tidak disentuh, ekspor T-017 baru di T-046).

## Acceptance criteria
- [x] Given sel terpotong atau gagal cast dipilih (F2/Enter), then panel Isi sel menampilkan isi lengkap, nilai asli + 'Tidak terbaca sebagai <tipe>' untuk sel gagal cast, dan sumber 'maret-2026.xlsx · baris 1.234 · Maret 2026'
- [x] Given sel fokus, when Ctrl/Cmd+C, then nilai terbaca Excel sebagai angka/tanggal (tanpa pemisah ribuan, desimal sesuai pilihan koma/titik, tanggal ISO)
- [x] Given ≤ 1.000 baris dipilih lewat nomor baris, when Ctrl+C, then TSV + baris judul tersalin, sel teks berawalan = + - @ dinetralkan, dan angka negatif tidak berubah; pilihan > 1.000 baris memunculkan tawaran 'Unduh tampilan'
- [x] Given kolom angka dipilih, then bilah status menampilkan Jumlah, Rata-rata, Min, Maks, dan Hitung atas seluruh baris tersaring, sama dengan widget KPI setara

## Risk
- Impact: halaman Lihat data (sheet-grid.tsx: keyboard F2/Enter/Ctrl+C/Shift+Spasi/Escape di sel, pilihan baris, bilah status) + endpoint baru POST /api/sheets/:id/stats. Rute dashboard/widget tidak berubah; CachedQuery mendapat varian `gridStats` (ringkasan kecil, 128 B).
- Security (STRIDE): S/E — stats memakai authorize() yang sama (pemilik/editor; viewer/asing 403, versi lain 409); T — zod strict, kolom hanya posisi skema terlihat, nilai saring/cari sebagai parameter, ekspresi agregat = measureExpr KPI; I — kolom tersembunyi ditolak tanpa nama; salinan teks berawalan = + - @ tab CR dinetralkan (D14) agar tidak dieksekusi Excel; D — rate grid RULES.grid, gerbang grid (≤ 2 slot global, 2 in-flight/user), klien lewat gridSlots, ringkasan ditunda 300 ms + dibatalkan, salin baris ≤ 1.000 (≤ 2 permintaan 500 baris berurutan); R — N/A (baca-saja).
- Rollback: revert commit T-045 (tanpa migrasi DB, tanpa perubahan dependensi).
- Validation: unit grid.test (stats = KPI dihitung ulang, akses, cache, timeout), grid-http.test (stats: RULES.grid, Origin, gerbang), grid-copy.test (nilai Excel, netralisasi = FORMULA_START ekspor, TSV); e2e data-view-copy 4/4 (termasuk paritas /api/query KPI); regresi e2e data-view 5/5, data-view-query 4/4, data-view-scroll 7/7; chunk grid 291,2/293 KiB.

## Notes
- Keputusan: panel Isi sel di chunk lazy terpisah (React.lazy, ±2 KiB gzip, tidak dihitung anggaran grid); chunk grid naik 287,1 → 291,2 KiB (batas 293) — sisa ruang 1,8 KiB untuk T-048.
- Keputusan: salin baris memakai baris di cache grid bila semuanya sudah dimuat, selain itu diambil ulang per ≤ 500 baris lewat gridSlots; sel teks > 500 karakter di salin BARIS ikut terpotong (diumumkan "N sel teks lebih dari 500 karakter terpotong"); salin SATU sel dan tombol "Salin isi" di panel mengambil isi penuh.
- Keputusan: pilihan desimal "Desimal salinan: Koma/Titik" di bilah status, bawaan dari bahasa peramban, disimpan di localStorage (dd.grid.copyDecimal, try/catch). Ya/Tidak disalin sebagai teks "Ya"/"Tidak"; durasi sebagai [h]:mm:ss.
- Tawaran "Unduh tampilan" (> 1.000 baris) berupa pesan di bilah pilihan; tombol ekspornya disambungkan di T-046 (job T-017), sesuai rencana P-14.
- Sumber "· periode" baru terisi setelah fitur periode (Bagian B); kini server mengirim period null sehingga hanya "file · baris N" yang tampil (diuji unit sourceText untuk bentuk dengan periode).
- Escape di sel melepas pilihan baris; F2/Enter di sel nomor baris tidak membuka panel (Ctrl+C di nomor baris tanpa pilihan menyalin baris itu).
- Review putaran 1 (koordinator): H1 diperbaiki — salin satu sel dan "Salin isi" memakai kutip TSV yang sama dengan salin baris (clipCell), teks bertab/baris baru tetap satu sel sehingga baris berikutnya seperti "=HYPERLINK(…)" tidak jadi formula; unit grid-copy.test 'clipCell'. L2 (klik ganda nomor baris membatalkan pilihan), L4 (kolom ringkasan disembunyikan → ringkasan hilang), L5 (Ctrl+C sel gagal cast menyalin nilai asli; e2e AC2) diperbaiki. L3 (aria-selected pada baris terpilih) dialihkan ke T-048 (a11y Lihat data): AG Community hanya memasang aria-selected untuk rowSelection bawaan; pilihan diumumkan lewat live region. Chunk grid 291,3/293 KiB.
- Tidak dicek: Firefox/WebKit untuk papan klip (e2e hanya Chromium); NVDA/VoiceOver (ikut T-048); skill frontend-expert tidak tersedia di sesi cloud ini.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — terverifikasi: batas kepercayaan = Route Handler /api/sheets/:id/{stats,cell,rows} (authorize T-041); klien hanya mengirim posisi kolom, saringan, cari; papan klip diisi di klien dari data yang sudah boleh dibaca
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; route memakai withUser()/requireUser()
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — terverifikasi: stats memakai authorize() yang sama (pemilik/editor; viewer/asing FORBIDDEN, versi lain VERSION_CHANGED) — unit grid.test 'T-045: ringkasan kolom angka'
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — terverifikasi: statsBodySchema zod strict (bentuk filters/search rowsBodySchema), posisi dicocokkan skema terlihat, hanya kolom angka; nilai saring/cari parameter binding; salinan teks = + - @ tab CR dinetralkan (unit grid-copy.test, sama dengan FORMULA_START ekspor); panel merender teks sebagai teks React (tanpa HTML)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data terenkripsi baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — terverifikasi: pesan galat/timeout stats tanpa nama kolom/sheet; error tak terduga → 503 umum (withUser)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — terverifikasi: kolom tersembunyi ditolak tanpa nama; yang di-cache hanya 5 angka ringkasan per (versi, revisi, saringan, cari); isi sel/salinan tidak dicatat di log; localStorage hanya pilihan desimal
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal baru (fetch same-origin)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — terverifikasi: tanpa dependensi baru (package.json/lockfile tidak berubah)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — terverifikasi: salin baris ≤ 1.000 (klien; lebih → tawaran Unduh tampilan), diambil ≤ 500/permintaan berurutan lewat gridSlots (≤ 2 in-flight); ringkasan ditunda 300 ms dan dibatalkan saat kolom/tampilan berganti; tampilan berganti saat salin → dibatalkan (gen)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — terverifikasi: endpoint baru POST stats: zod strict, Origin wajib (rejectCrossOrigin), RULES.grid, body ≤ 64 KB, mesin lewat gerbang grid — unit grid-http.test
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — terverifikasi: CSP/headers tidak berubah; tanpa debug baru; chunk AG tetap hanya rute Lihat data (measure-grid-chunk: 291,2/293 KiB, leakedToDashboard [])

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T08:55:43Z (188660 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 0cb153a, 1220871, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 3602b55, 36afc9f, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 5603fc7, 56a8447, 56e4d6d, 59ec9a3, 6123427, 62ec216, 69b8953, 6b3ee3f, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7f238c4, 7f9a7c7, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9298e14, 94bea50, 94d85a4, a019f8f, a03481c, a0e1646, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b8e59ee, ba2efef, c15362c, c1c8b0a, c2fd95c, c76c343, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, d32a8ea, d557c9e, da46e35, dff9b8c, e24e070, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-code: 0 findings
