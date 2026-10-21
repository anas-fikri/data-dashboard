---
id: T-071
title: Tambahkan Top N per kelompok dengan kelompok Lainnya pada pivot dan grafik
status: in_progress
profile: standard
profile_pinned: true
goal: G-7
tags:
  - query
  - ui
depends_on:
  - T-070
created: "2026-10-21T10:24:11Z"
updated: "2026-10-21T15:51:51Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 3f152101681a08aaf94f9708fc28132bb0b4eb74
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 219520
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792597866061,"service":"data-dashboard","host":"127.0.0.1","port":45991,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792597866116,"service":"data-dashboard","host":"127.0.0.1","port":36417,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792597866211,"service":"data-dashboard","host":"127.0.0.1","port":35927,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792597866330,"service":"data-dashboard","host":"127.0.0.1","port":34693,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792597876986,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792597889469,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792597889491,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792597889494,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792597889519,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  214 passed | 1 skipped (215)
            Tests  2920 passed | 10 skipped (2930)
         Start at  15:49:17
         Duration  152.81s (tests 84%, import 13%, transform 3%)

          Isolate  215 workers spawned · ~165ms startup each (spawn + environment, per file)
                   at least ~11.68s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T15:51:51Z"
    tree: 3c5770b4d68cd0aaa361e71e20994f05a377292d83adb64d81b550e26431d654
  audit:
    at: "2026-10-21T15:41:25Z"
    passed: true
    tree: d08e2904667b0fcba515c26663533b405658d7a4b1992568f55404c23430d820
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 520 dirs visited, 4642 inodes visited, 1 Extract calls, 306.608561ms elapsed, 306.608927ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Top N per level baris pivot (N teratas per kelompok induk menurut nilai pilihan) dengan sisa digabung ke 'Lainnya' yang dihitung ulang dari baris mentah, juga untuk dimensi grafik bar. Rencana G-7 §3.4.

## Acceptance criteria
- [x] Given pivot Wilayah > Kota dengan Top 5 Kota per Wilayah menurut Total Pendapatan, then setiap wilayah menampilkan ≤ 5 kota teratas + baris 'Lainnya' berisi agregat sisa kota wilayah itu, dan subtotal wilayah = jumlah tampil + Lainnya = subtotal tanpa Top N
- [x] Given nilai rata-rata, jumlah unik, minimum/maksimum, atau field terhitung, then nilai 'Lainnya' dihitung ulang dari baris mentah kelompok sisa (bukan menjumlah rata-rata), teruji terhadap fixture dengan nilai manual
- [x] Given dimensi yang dipakai total berjalan/selisih (T-067), then Top N pada dimensi itu ditolak validasi dengan pesan yang menjelaskan alasannya; given label data asli bernama 'Lainnya', then tetap terbedakan dari kelompok sistem (penanda internal, label '(Lainnya)')
- [x] Given klik baris 'Lainnya' untuk filter silang, then tidak menyaring widget lain (tidak bisa dipilih) dan tidak menambah nilai ke dashboardFilters; given ekspor dan PDF, then 'Lainnya' ikut dengan label yang sama
- [x] Given Top N bar chart yang sudah ada (topN + irisan Lainnya pai), then perilaku lama tidak berubah (uji regresi) dan opsi Top N pivot memakai komponen select kustom yang sama

## Risk
- Impact: SQL pivot hanya berubah untuk spec ber-`topN` (CTE `s0` → `top<j>` → `src`, penanda `x<level>` di kunci kelompok, kolom keluaran `ox`); spec tanpa Top N (1.0.0 dan bentuk T-070) SQL + kunci cache identik (golden HEAD 3f15210), grafik bar/pai SQL identik. Biaya: satu pindaian agregat tambahan per level ber-Top N.
- Security (STRIDE): N dan indeks nilai divalidasi zod (bilangan bulat 1–50 / 0–7, `strict`), identifier hanya dari program; tidak ada input klien baru di endpoint viewer (D6 tetap). "(Lainnya)" tidak punya `pick` → tidak bisa dikirim sebagai filter silang; nilai null yang dikirim manual tetap berarti "(kosong)" (filter sah, bukan kebocoran).
- Rollback: tanpa migrasi DB. Rollback image membuat widget ber-Top N "Pengaturan widget tidak valid" sampai upgrade lagi — query SQL pencari + langkah di runbook-deploy §7 dan CHANGELOG Unreleased/Notes.
- Validation: `tests/features/query/pivot-topn.test.ts` (DuckDB, nilai manual), `tests/components/pivot-ui.test.ts` (panel/model/markup), e2e `pivot.spec.ts` T-071 (panel → tabel, filter silang, CSV, halaman cetak).

## Notes
- Keputusan (aman, standar): Top N = N kelompok **terbesar** di dalam induknya menurut nilai dasar ke-`by` (agregat/field terhitung, bukan hasil Tampilkan nilai sebagai; % keseluruhan monoton terhadapnya), seri dipecah label naik; "(Lainnya)" selalu terakhir di induknya untuk semua urutan; jumlah baris di catatan "N dari M" dihitung setelah penggabungan.
- "(Lainnya)" di level induk tetap punya rincian level di bawahnya (dihitung ulang dari baris mentah gabungan); rincian itu tetap bisa jadi filter silang (filter kolom rincian sah), induk "(Lainnya)" tidak.
- Top N pada baris terdalam ditolak bila ada nilai Total berjalan/Selisih/% selisih tanpa Pisahkan per (sumbu = baris terdalam); dengan Pisahkan per sumbunya kolom, jadi diizinkan. Panel menandai isian dan tidak menyimpan.
- Grafik: Top N bar (tanpa batang Lainnya) dan pai (5 + irisan Lainnya) tidak diubah — uji regresi hash SQL. Batang "Lainnya" untuk grafik bar tidak ditambahkan (AC5 meminta perilaku lama tetap); pilihan grafik dari pivot tersimpan menyusul di T-073.
- Pilihan panel: Semua / 3 / 5 / 10 / 20 / 50 teratas (select kustom `Choice`, sama dengan pilihan lain panel); spec menerima 1–50 dan nilai non-preset yang tersimpan tetap ditawarkan.
- Review putaran 1 (0 blokir): L2 diperbaiki — nama aksesibel "Tampilkan <field>" / "Teratas menurut — <field>" unik per baris; L1 (kategori data yang persis bernama "(Lainnya)" tidak terbedakan di CSV/XLSX/PDF) → task lanjutan T-tpw2.
- Belum diukur: perf Top N di fixture 10 jt baris (masuk T-075). UI lewat plugin frontend-expert + /frontend-expert:audit belum dijalankan di sesi cloud (seperti T-069/T-070).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — terverifikasi: batas kepercayaan tidak berubah — topN bagian spec widget dari DB (parseWidgetConfig zod), SQL Top N dibangun server di pivot.ts
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — terverifikasi: tanpa endpoint baru; viewer tetap { widgetId, dashboardFilters, … } (D6); "(Lainnya)" tanpa pick sehingga tidak menambah nilai filter silang; kolom filter silang yang diizinkan tidak berubah
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — terverifikasi: topN strict { n int 1–50, by int 0–7 < jumlah nilai } + aturan sumbu running (zod superRefine); N di SQL = bilangan bulat tervalidasi (Math.trunc), identifier hanya alias program k<i>/x<i>/t<i> + c<pos> dari skema
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — terverifikasi: galat validasi lewat pesan parseWidgetConfig (bahasa Indonesia, tanpa detail internal)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: data sama dengan pivot sebelumnya; kunci cache memuat shape.top sehingga hasil ber-Top N tidak tertukar
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — terverifikasi: tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — terverifikasi: N ≤ 50 per level, maks. 4 level; batas 200 baris tampil, anggaran sel, dan timeout query tetap berlaku; satu pindaian agregat tambahan per level ber-Top N
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — terverifikasi: body /api/query tetap strict; PATCH widget memvalidasi spec dengan skema pivot strict (field baru hanya topN)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa perubahan konfigurasi
