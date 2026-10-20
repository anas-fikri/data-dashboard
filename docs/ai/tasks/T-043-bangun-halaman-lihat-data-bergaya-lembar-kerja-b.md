---
id: T-043
title: Bangun halaman 'Lihat data' bergaya lembar kerja (baca-saja)
status: blocked
profile: strict
goal: G-6
tags:
  - ui
depends_on:
  - T-041
  - T-035
created: "2026-10-15T02:30:56Z"
updated: "2026-10-20T07:38:17Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: f87b0a158f8791768676c74c63309a2ef011c438
paths:
  - package-lock.json
  - package.json
  - playwright.config.ts
  - scripts/measure-grid-chunk.mjs
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/(app)/datasets/[id]/data/page.tsx
  - src/app/(app)/datasets/[id]/skema/page.tsx
  - src/app/globals.css
  - src/components/datasets/dataset-data-summary.tsx
  - src/components/grid/grid-fetch.ts
  - src/components/grid/grid-header.tsx
  - src/components/grid/grid-mitigations.ts
  - src/components/grid/grid-model.ts
  - src/components/grid/sheet-grid-loader.tsx
  - src/components/grid/sheet-grid.tsx
  - src/components/schema/sheet-tabs.tsx
  - src/features/query/grid-page.ts
  - tests/components/dashboard-page-access.test.ts
  - tests/components/grid-model.test.ts
  - tests/e2e/data-view-scroll.spec.ts
  - tests/e2e/data-view.spec.ts
  - tests/features/query/grid-page.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T07:37:51Z"
      findings: 4
    - "n": 2
      by: claude-code
      at: "2026-10-20T07:37:51Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 190559
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792481765274,"service":"data-dashboard","host":"127.0.0.1","port":36913,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792481765331,"service":"data-dashboard","host":"127.0.0.1","port":43029,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792481765434,"service":"data-dashboard","host":"127.0.0.1","port":44041,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792481765548,"service":"data-dashboard","host":"127.0.0.1","port":43285,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792481775032,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792481783154,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792481783176,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792481783179,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792481783187,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  168 passed | 1 skipped (169)
            Tests  2166 passed | 10 skipped (2176)
         Start at  07:34:43
         Duration  133.47s (tests 85%, import 12%, transform 3%)

          Isolate  169 workers spawned · ~155ms startup each (spawn + environment, per file)
                   at least ~8.59s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T07:36:58Z"
    tree: c8de71a4670d63bb80694a7a99c7be930c5f7a32f6829f27a6574643813459fc
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
    - 2d7b316
    - 3602b55
    - 36afc9f
    - 3bb3baa
    - 49f49a5
    - 4bd9881
    - 4eea84c
    - 5101f51
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
    total: 6
    done: 5
  audit:
    at: "2026-10-20T07:37:52Z"
    passed: true
    tree: c8de71a4670d63bb80694a7a99c7be930c5f7a32f6829f27a6574643813459fc
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 425 dirs visited, 2063 inodes visited, 1 Extract calls, 216.249716ms elapsed, 216.250515ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-11, Fase 2. Perkiraan 4–5 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given pemilik/editor klik 'Lihat data', when halaman dimuat, then grid menampilkan sheet aktif dengan huruf kolom + nama + ikon tipe, header dan nomor baris beku, tab sheet di bawah, format id-ID (angka, d Mmm yyyy, Rp, Ya/Tidak, NULL kosong), dan status 'Baris 1–40 dari 9.812.334'
- [x] Given sheet 10 jt tanpa urut, when 'Ke baris 9.000.000' atau Ctrl+End, then baris itu tampil ≤ 1 detik, termasuk di Firefox
- [x] Given lebar kolom diubah atau di-autofit, kolom dibekukan (≤ 3), disembunyikan, atau digeser, when halaman dibuka lagi, then pengaturan pulih per (sheet, revisi skema); bila localStorage diblokir, grid tetap berfungsi
- [x] Given versi berganti saat menggulir, then muncul banner 'Data sudah diperbarui — Muat ulang' dan tidak ada baris dari dua versi yang tercampur
- [ ] Given grid Lihat data dengan NVDA (Windows, Firefox/Chrome) dan VoiceOver (macOS Safari), when pengguna menavigasi sel dengan panah, Home/End, PageUp/PageDown, dan header diurutkan, then posisi baris/kolom, nama kolom, isi sel, dan status urut diumumkan (gerbang ADR-0007; gagal → fallback TanStack Virtual + paging blok)
- [x] Given semua mitigasi ADR-0007 aktif bersamaan di Chromium, WebKit, dan Firefox, when seret ke akhir, wheel, Cmd+↓/End/PageDown di akhir data, serta ArrowDown ×25 dan PageDown dari baris 5 jt, then baris terakhir tampil penuh, baris terfokus selalu terlihat penuh (WCAG 2.4.11, terang dan gelap), wheel median ≤ 5 dan maks ≤ 8 baris per 100 px, dan chunk rute ≤ 293 KiB gzip pada build Next

## Risk
- Impact: rute baru `/datasets/[id]/data` + tombol "Lihat data" di profil dataset, skema, dan dashboard (pemilik/editor);
  dependensi baru `ag-grid-community`/`ag-grid-react` 36.2.0 (MIT, dipin, dimuat lazy hanya di rute ini). Tidak ada
  perubahan endpoint, skema DB, atau worker.
- Security (STRIDE): akses halaman lewat `gridPageView` (pemilik dataset atau editor dashboard-nya; selain itu 404);
  kolom tersembunyi skema tidak dikirim ke klien; data hanya lewat endpoint T-041 (otorisasi + 409 versi di server).
  Pengaturan kolom di localStorage hanya berisi colId/lebar/format, dibersihkan saat dibaca. CSP tidak berubah;
  `styleNonce` dari nonce permintaan.
- Rollback: revert commit T-043 (hapus rute, komponen grid, tautan, dependensi AG). Data tidak tersentuh.
- Validation: unit `tests/components/grid-model.test.ts` (18), `tests/features/query/grid-page.test.ts` (4),
  `dashboard-page-access` (tautan per peran); e2e `data-view` (5, Chromium, data sungguhan, termasuk sheet 140 kolom) dan `data-view-scroll`
  (7 × Chromium/Firefox/WebKit, 10 jt baris sintetis); `node scripts/measure-grid-chunk.mjs` 259,9 KiB ≤ 293.

## Notes
- AC 1: e2e `data-view` "AC1" — huruf + nama + tipe (sr-only), kolom "Baris" beku, format id-ID (1.000, 1,25,
  2 Mar 2026, Ya/Tidak, NULL kosong, teks 500 karakter + "…", Rupiah lewat menu Format tampilan), status
  "Baris 1–N dari 450", tab sheet di bawah grid, sentinel "Akhir data", tanpa "AG Grid: error #200".
- AC 2: e2e `data-view-scroll` 3 engine — Ke baris 9.000.000 dan Ctrl+End ≤ 1 s (diukur `performance.now()` di
  halaman, respons blok sintetis instan; latensi server diukur terpisah di T-041/T-042).
- AC 3: e2e "AC3" — beku (≤ 3; kolom ke-4 dinonaktifkan), sembunyi, autofit, seret lebar, geser kolom (lewat API
  grid) pulih setelah muat ulang per kunci `dd.grid.v1:<sheet>:<revisi>`; localStorage melempar → grid tetap
  memuat dan menu tetap jalan.
- AC 4: e2e "AC4" — versi kedua diunggah saat grid terbuka; blok berikut 409 → banner "Data sudah diperbarui",
  blok tidak diisi, tanpa baris "Z…" di grid lama; "Muat ulang" memuat versi baru. Klien juga menolak respons dengan
  versi/revisi lain (unit `fetchBlock`).
- AC 5 (NVDA/VoiceOver): **belum bisa diverifikasi di container** — butuh pemilik di Windows (NVDA, Firefox/Chrome)
  dan macOS (VoiceOver, Safari). Sudah ada: `role=grid` + aria-label, `aria-rowcount` = total + 2, `aria-rowindex`
  dari AG, nama/tipe kolom di kepala, live region "Ke baris N". Urut kolom (dan pengumuman `aria-sort`) masuk
  T-044 (P-12), jadi bagian "header diurutkan" belum bisa diuji di T-043. Gerbang ini menentukan ADR-0007 `accepted`.
- AC 5 — langkah uji manual untuk pemilik (centang AC 5 hanya oleh pemilik setelah lulus; gagal Critical/High →
  kriteria fallback ADR-0007):
  1. Siapkan dataset dengan ≥ 300 baris dan kolom teks/angka/tanggal/Ya-Tidak; buka profil dataset → "Lihat data".
  2. Windows + NVDA (terbaru), di Firefox lalu Chrome. macOS + VoiceOver (Cmd+F5), di Safari.
  3. Tab ke grid (atau klik sel A1). Harus terdengar: nama grid "Data sheet <nama>", jumlah baris (total + 2),
     posisi "baris 2, kolom 2", nama kolom (huruf + nama + tipe, mis. "A Kode, Teks"), dan isi sel.
  4. Panah kanan/kiri/atas/bawah: setiap langkah mengumumkan kolom baru (nama) atau baris baru (nomor) + isi sel.
  5. Home/End (awal/akhir baris), PageDown/PageUp: posisi baris diumumkan; baris terfokus terlihat di layar.
  6. Ctrl+End (Cmd+End di Mac): fokus ke baris data terakhir, diumumkan nomornya. Panah bawah sekali lagi:
     terdengar "Akhir data" (baris sentinel, `aria-rowcount` = total + 2 — sesuai ADR-0007).
  7. Ctrl+Home: kembali ke baris 1. Isi "Ke baris" = 150 lalu Enter: terdengar "Ke baris 150" dan fokus di baris 150.
  8. Fokus ke kepala kolom (panah atas dari baris 1), tekan Enter: menu kolom terbuka dan item terbaca; Esc
     mengembalikan fokus ke kepala kolom.
  9. Urut kolom + `aria-sort` belum ada di T-043 (masuk T-044): ulangi langkah "header diurutkan" setelah T-044.
  10. Catat engine/versi pembaca layar, langkah yang gagal, dan kutipan pengumuman di Notes task ini.
- AC 6: semua mitigasi aktif, 3 engine lulus (seret ke akhir, wheel median 3 / maks 4–6, Ctrl+↓/End/PageDown di
  akhir, ArrowDown ×25 + PageDown dari 5 jt, cincin fokus terang/gelap ≥ 3:1); chunk 259,9 KiB. Laporan
  `docs/ai/perf/T-043.md`. Batas: seret thumb diuji via scrollTop maks; sentuh/trackpad nyata tidak diuji.
- Dilewati (task lanjutan G-6 yang sudah ada): urut/saring/cari (T-044), Isi sel + salin + ringkasan (T-045),
  unduh tampilan (T-046), ponsel/keyboard lengkap + axe (T-048). Ikon bawaan AG (bayangan seret kolom) belum
  diganti Tabler — kosmetik.
- Review putaran 1 (orkestrator): H1 sheet > 64 kolom memecah satu blok jadi beberapa POST paralel → 429
  QUERY_BUSY (> 128 kolom selalu gagal): potongan kolom kini diambil berurutan (≤ 1 slot server per blok, ≤ 2
  blok bersamaan = batas per pengguna 2); e2e "Sheet lebar 140 kolom" (gagal di kode lama, lulus sekarang) + unit
  puncak konkurensi 1. M1: 429 QUERY_BUSY dicoba ulang 150/400/900 ms lalu diperlakukan seperti blok batal
  (dimuat ulang saat terlihat, pengatur waktu 1 s), bukan banner galat. L1: purge memakai generasi — batal akibat
  purge tidak memicu purge kedua. L2: package-lock dikembalikan ke lockfile f87b0a1 + hanya 4 paket ag-* (medan
  `libc` utuh; npm 10.9.x di container menghapusnya bila meregenerasi).
- Firefox/WebKit Playwright: `npx playwright install firefox webkit` (+ `install-deps` di Linux).

## Conventions check
- Tokens: src/styles/tokens.css lewat `hsl(var(--…))` di tema AG dan CSS grid; tanpa hex mentah
- Icons: @tabler/icons-react (size 20/16 stroke 1.5); tanpa Lucide
- Audit: plugin frontend-expert tidak tersedia di sesi cloud; prinsip diterapkan manual (token, fokus terlihat, label, target)
- States: loading (kerangka saat chunk dimuat, "Memuat…" sel) / empty (belum ada data, sheet belum siap, semua kolom disembunyikan) / error (banner Coba lagi, banner versi berganti)
- Responsive: grid menggulir di dalam wadah; toolbar menumpuk < 640; tombol full-width < 640 (penyesuaian ponsel lengkap T-048)
- A11y: role=grid + aria-label, kepala kolom dengan nama + tipe, menu kolom via Enter, live region, cincin fokus 2px

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — terverifikasi: batas = halaman server (gridPageView) + endpoint T-041; klien hanya menampilkan blok yang diizinkan server
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; halaman memanggil requireUser()
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — terverifikasi: pemilik/editor saja, selain itu 404 (unit grid-page + e2e viewer 404); endpoint baris tetap otorisasi T-041
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — terverifikasi: ?sheet divalidasi regex, id via isIdShape; nilai sel dirender sebagai teks oleh AG (tanpa innerHTML); pengaturan localStorage disanitasi (unit)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data terenkripsi baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — terverifikasi: klien menampilkan pesan server (sudah tanpa nama kolom) atau pesan umum
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — terverifikasi: kolom tersembunyi skema tidak dikirim; localStorage hanya colId/lebar/format, bukan nilai data; fetch cache no-store; blok ≤ 50 di memori
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal baru (fetch same-origin)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — terverifikasi: ag-grid-community/react 36.2.0 MIT dipin persis (ADR-0007), lint + tes melarang Enterprise, npm audit 0; kait window.__ddGrid hanya NODE_ENV≠production
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — terverifikasi: versi dipin per permintaan, 409/versi lain ditolak tanpa mencampur baris (e2e AC4 + unit); batas laju/slot grid tetap dari T-042, klien 2 permintaan bersamaan + pembatalan
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — terverifikasi: tidak ada endpoint baru; memakai endpoint T-041 (zod strict, Origin, rate grid)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — terverifikasi: CSP T-027 tidak berubah, styleNonce dari nonce permintaan; chunk AG hanya di rute ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T07:36:58Z (190559 ms)
- Acceptance criteria: 5/6 satisfied
- Commits: 0cb153a, 1220871, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 2d7b316, 3602b55, 36afc9f, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 56e4d6d, 59ec9a3, 6123427, 62ec216, 69b8953, 6b3ee3f, 7187327, 75cf456, 7824e56, 7ae2840, 7af4484, 7f238c4, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9298e14, 94bea50, 94d85a4, a019f8f, a03481c, a0e1646, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b8e59ee, ba2efef, c15362c, c1c8b0a, c2fd95c, c76c343, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, d32a8ea, d557c9e, da46e35, e24e070, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 4 findings
- Review pass 2 by claude-code: 0 findings
