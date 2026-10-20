---
id: T-044
title: Tambahkan urut multi-kolom, saring per kolom, dan cari di Lihat data
status: done
profile: strict
goal: G-6
tags:
  - ui
  - api
depends_on:
  - T-043
  - T-042
created: "2026-10-15T02:30:56Z"
updated: "2026-10-20T08:20:42Z"
closed: "2026-10-20T08:20:42Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 7f9a7c73949fe92e64964da226791330ea9e43d0
paths:
  - playwright.config.ts
  - src/app/api/sheets/[id]/values/route.ts
  - src/app/globals.css
  - src/components/dashboards/filters/date-panel.tsx
  - src/components/grid/grid-fetch.ts
  - src/components/grid/grid-filter-dialog.tsx
  - src/components/grid/grid-header.tsx
  - src/components/grid/grid-model.ts
  - src/components/grid/sheet-grid.tsx
  - src/components/grid/use-grid-values.ts
  - src/features/query/grid-http.ts
  - src/features/query/grid-service.ts
  - src/features/query/grid.ts
  - tests/components/grid-model.test.ts
  - tests/e2e/data-view-query.spec.ts
  - tests/features/query/grid-http.test.ts
  - tests/features/query/grid.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T08:17:02Z"
      findings: 4
    - "n": 2
      by: claude-code
      at: "2026-10-20T08:17:02Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 192591
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792484357352,"service":"data-dashboard","host":"127.0.0.1","port":43023,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792484357411,"service":"data-dashboard","host":"127.0.0.1","port":44331,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792484357510,"service":"data-dashboard","host":"127.0.0.1","port":37127,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792484357633,"service":"data-dashboard","host":"127.0.0.1","port":38647,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792484368609,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792484378166,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792484378188,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792484378191,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792484378200,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  168 passed | 1 skipped (169)
            Tests  2182 passed | 10 skipped (2192)
         Start at  08:17:56
         Duration  137.37s (tests 85%, import 12%, transform 3%)

          Isolate  169 workers spawned · ~163ms startup each (spawn + environment, per file)
                   at least ~9.04s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T08:20:16Z"
    tree: 1f9adead9258dd4e9c4b023d26057b8d691efbd4e9cdcc8725c3ad1ebd70e42d
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
    - 56e4d6d
    - 59ec9a3
    - "6123427"
    - 62ec216
    - 69b8953
    - 6b3ee3f
    - "7187327"
    - 75cf456
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
    at: "2026-10-20T08:20:16Z"
    passed: true
    tree: 1f9adead9258dd4e9c4b023d26057b8d691efbd4e9cdcc8725c3ad1ebd70e42d
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 443 dirs visited, 2154 inodes visited, 1 Extract calls, 221.525345ms elapsed, 221.525911ms wall time
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
Rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-12, Fase 2 (§3.1 "Urut, saring, cari",
§3.4, §3.7). Grid "Lihat data" (T-043) mendapat: urut server lewat klik/Shift+klik kepala kolom (≤ 3 kolom,
aria-sort), saring per kolom (Alt+↓: daftar nilai + cari untuk teks, rentang angka, rentang + preset tanggal)
dengan chip dan "Hapus semua saringan", serta cari Ctrl+F di ≤ 10 kolom teks terlihat (sorot sel, "Ditemukan
di N baris", batas 10 detik, bisa dibatalkan). Semua dihitung server lewat endpoint T-041 (jalur 2); klien
tetap ≤ 2 permintaan in-flight (jatah T-042). Kontrak T-016 (pemilik/editor saja) dan T-017 (ekspor tidak
disentuh; "Unduh tampilan" = T-046) dicek ulang (R21): tidak berubah.

## Acceptance criteria
- [x] Given klik header (naik → turun → tanpa urut) atau Shift+klik (≤ 3 kolom), then urutan dihitung server, aria-sort benar, dan nomor baris mengikuti urutan baru
- [x] Given menu saring (Alt+↓) berupa daftar nilai + cari untuk teks, rentang untuk angka, serta rentang + preset untuk tanggal, when diterapkan, then chip saringan tampil, status 'x baris (tersaring dari y)', dan 'Hapus semua saringan' berfungsi
- [x] Given Ctrl+F 'jakarta' di dalam grid, then hanya baris yang mengandung teks itu di ≤ 10 kolom teks terlihat yang tampil, sel cocok disorot, muncul 'Ditemukan di N baris', dan pencarian dibatasi 10 detik serta bisa dibatalkan
- [x] Given urut teks pada 10 jt baris melewati QUERY_TIMEOUT_MS, then tampil 'Pengurutan ini terlalu berat; saring data dulu' dan grid tetap bisa dipakai

## Risk
- Impact: klien grid Lihat data (src/components/grid/*), layanan grid (pesan batas waktu, batas cari 10 s,
  endpoint baru POST /api/sheets/:id/values), DatePanel dashboard (dashboardId opsional). Query widget,
  /api/query, dan otorisasi dashboard tidak tersentuh.
- Security (STRIDE): Information disclosure — daftar nilai hanya untuk pemilik/editor lewat authorize() yang
  sama dengan jendela baris (viewer/asing 403, kolom tersembunyi 400 tanpa nama, versi lain 409); Tampering —
  body zod strict, posisi kolom divalidasi skema, nilai cari/saring sebagai parameter (tanpa SQL dari klien);
  DoS — aturan rate grid (300/menit), gerbang slot grid, cari ≤ 10 s, daftar nilai ≤ 10 s dan ≤ 1.000 nilai,
  klien ≤ 2 permintaan bersamaan (gridSlots) dan membatalkan blok tampilan lama.
- Rollback: revert commit T-044 (tanpa migrasi/skema data); endpoint values hilang bersama klien.
- Validation: unit grid.test (timeout urut/cari, daftar nilai, akses), grid-http.test (rate/Origin), grid-model
  test (sortFromModel, searchColumns, Slots, fetchBlock query/timeout, fetchGridValues); e2e data-view-query
  4/4 + regresi data-view 5/5, data-view-scroll 7/7, grid 2/2; chunk lazy 287,1 KiB ≤ 293.

## Notes
- Keputusan (standar aman, dicatat): Enter di kepala kolom tetap membuka menu kolom (langkah 8 uji NVDA T-043
  tidak berubah); urut dengan keyboard lewat menu ("Urutkan naik/turun", "Tambah ke urutan", "Lepas urutan");
  klik nama kolom = urut, Shift+klik = tambah (≤ 3; kolom ke-4 dilepas lagi + diumumkan). Enter/Alt+↓ di kepala
  kolom ditekan dari AG (suppressHeaderKeyboardEvent) agar AG tidak ikut mengurutkan.
- Saringan diterapkan lewat "Terapkan" (draf), bukan per centang: satu query 10 jt baris per penerapan.
- Daftar nilai saring tidak ikut menyaring kolom lain (semua nilai kolom, sama dengan slicer); di-cache seperti
  ringkasan (≤ 256 KiB per entri); blok baris tetap tidak.
- Sorotan cari memakai teks sel yang dikirim (≤ 500 karakter): kecocokan setelah karakter ke-500 tetap
  membuat baris tampil tetapi selnya tidak disorot.
- AC4 diuji dengan jawaban 504 QUERY_TIMEOUT yang disimulasikan (e2e) + unit mesin yang time-out; pengukuran
  urut teks 10 jt baris sungguhan = P-29 (T-061).
- frontend-expert plugin tidak tersedia di sesi cloud ini: UI mengikuti token/komponen yang ada (Button,
  Input, Radix Dialog, isi slicer/rentang dashboard), ikon Tabler size 20/16 stroke 1.5; audit
  /frontend-expert:audit perlu dijalankan dari sesi yang punya plugin (masuk gerbang T-048).
- Review putaran 1 (koordinator): #1 jumlah basi setelah timeout/galat (blocking) — startView mengosongkan
  total/all, jumlah disembunyikan saat timeout/galat; #2 bilah status dijaga `loading`; #3 kolom cari dihitung
  ulang saat visibilitas kolom berubah; #4 label menu "Urutkan … saja (lepas urutan lain)". Regresi: e2e
  data-view-query AC3 (sembunyikan kolom → cols [1]) dan AC4 (timeout → tanpa "Ditemukan di", status "Baris
  belum dimuat").
- Chunk lazy grid naik 259,9 → 287,1 KiB gzip (batas 293): sisa ruang ±6 KiB untuk T-045/T-046.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — terverifikasi: batas kepercayaan = Route Handler /api/sheets/:id/{rows,values} (authorize T-041); klien hanya mengirim posisi kolom + nilai
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; route memakai withUser()/requireUser()
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — terverifikasi: values memakai authorize() yang sama dengan rows (pemilik/editor; viewer/asing FORBIDDEN, versi lain VERSION_CHANGED) — unit grid.test "daftar nilai menu saring"
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — terverifikasi: valuesBodySchema zod strict (q ≤ 100), posisi dicocokkan skema terlihat, nilai cari/saring/q sebagai parameter binding (buildFilterValuesSql/whereSql); sel dirender teks oleh AG
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data terenkripsi baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — terverifikasi: pesan timeout/galat tanpa nama kolom/sheet; error tak terduga → 503 umum (withUser)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — terverifikasi: kolom tersembunyi skema ditolak tanpa nama; kata cari/nilai tidak dicatat di log; blok baris tidak di-cache (hanya count + daftar nilai kecil)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal baru (fetch same-origin)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — terverifikasi: tanpa dependensi baru (package.json/lockfile tidak berubah)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — terverifikasi: ≤ 3 urut, ≤ 20 saringan, cari ≤ 10 kolom/100 karakter (server + klien); cari ≤ 10 s; klien ≤ 2 in-flight (unit Slots/slotFetch) dan membatalkan blok tampilan lama
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — terverifikasi: endpoint baru POST values: zod strict, Origin wajib (rejectCrossOrigin), rate grid RULES.grid, body ≤ 64 KB — unit grid-http.test
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — terverifikasi: CSP/headers tidak berubah; kait __ddGrid tetap hanya non-produksi; chunk AG hanya di rute Lihat data (measure-grid-chunk: leakedToDashboard [])

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T08:20:16Z (192591 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 0cb153a, 1220871, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 3602b55, 36afc9f, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 5603fc7, 56e4d6d, 59ec9a3, 6123427, 62ec216, 69b8953, 6b3ee3f, 7187327, 75cf456, 7824e56, 7ae2840, 7af4484, 7f238c4, 7f9a7c7, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9298e14, 94bea50, 94d85a4, a019f8f, a03481c, a0e1646, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b8e59ee, ba2efef, c15362c, c1c8b0a, c2fd95c, c76c343, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, d32a8ea, d557c9e, da46e35, e24e070, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 4 findings
- Review pass 2 by claude-code: 0 findings
