---
id: T-067
title: Tambahkan Tampilkan nilai sebagai pada pivot dan grafik
status: in_progress
profile: standard
profile_pinned: true
goal: G-7
tags:
  - query
  - ui
depends_on:
  - T-066
created: "2026-10-21T10:24:05Z"
updated: "2026-10-21T11:22:50Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: a4869d3237d790f51047e944cbbb789feb030082
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 218772
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792581724454,"service":"data-dashboard","host":"127.0.0.1","port":40049,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792581724513,"service":"data-dashboard","host":"127.0.0.1","port":38281,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792581724615,"service":"data-dashboard","host":"127.0.0.1","port":36065,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792581724730,"service":"data-dashboard","host":"127.0.0.1","port":34455,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792581734764,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792581747964,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792581747988,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792581747994,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792581748010,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  208 passed | 1 skipped (209)
            Tests  2728 passed | 10 skipped (2738)
         Start at  11:20:15
         Duration  152.74s (tests 84%, import 13%, transform 2%)

          Isolate  209 workers spawned · ~167ms startup each (spawn + environment, per file)
                   at least ~11.49s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.0.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T11:22:50Z"
    tree: 5c8065396bbc17449187bea395c8713e5d6b06beb52a9b1422a218d6cf674a74
  audit:
    at: "2026-10-21T11:18:35Z"
    passed: true
    tree: 5c8065396bbc17449187bea395c8713e5d6b06beb52a9b1422a218d6cf674a74
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 519 dirs visited, 4308 inodes visited, 1 Extract calls, 259.348699ms elapsed, 259.349248ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.0.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Setara 'Show Values As' Excel: % dari total keseluruhan, % dari total baris, % dari total kolom, total berjalan, selisih dan % selisih dari item sebelumnya. Dihitung server dari agregat seluruh data (bukan hanya baris yang tampil). Rencana G-7 §3.1.

## Acceptance criteria
- [x] Given pivot Wilayah × Bulan dengan nilai Total Pendapatan showAs pct_grand, when dimuat, then setiap sel = sel / total keseluruhan seluruh data yang lolos filter (termasuk baris di luar batas 200 tampil), total keseluruhan = 100%, dan format persen 1 desimal id-ID (mis. 12,5%)
- [x] Given showAs pct_row / pct_col, then sel dibagi total baris / total kolom yang sama (subtotal dibagi total barisnya), dihitung walau sakelar Total dimatikan, dan total baris pct_row = 100%
- [x] Given showAs running / diff_prev / pct_diff_prev, then dihitung sepanjang kolom pemisah bila ada, selain itu sepanjang baris terdalam di dalam kelompok induknya (reset per kelompok), dalam urutan label naik termasuk item sebelum potongan tampilan; item pertama selisih = kosong ('–'), sebelumnya 0 atau NULL → % selisih kosong, bukan error; sel total/subtotal untuk running/diff kosong
- [x] Given grafik bar/line dengan satu dimensi, then pct_grand, running, diff_prev, pct_diff_prev tersedia (pai hanya pct_grand); given running pada grafik garis N periode terbaru, then nilai pertama yang tampil sudah memuat periode sebelumnya yang terpotong
- [x] Given ekspor CSV/XLSX dan PDF pivot/grafik, then nilai yang diekspor = nilai yang tampil (XLSX sebagai angka dengan format persen), judul kolom menyebut cara tampil (mis. '% dari total kolom · Total Pendapatan'); given spec lama tanpa showAs, then hasil identik dengan sebelum task (uji regresi)

## Risk
- Impact: query widget pivot dan grafik (bar/line/pie) yang memakai showAs, ekspor CSV/XLSX/PDF-nya, panel konfigurasi. Spec tanpa showAs (atau "none") memakai SQL lama persis (buildPivotSql/buildSql bercabang hanya bila showAs dipakai) dan kunci cache lama tidak berubah.
- Security (STRIDE): Tampering/Injection — showAs enum tertutup divalidasi zod di spec tersimpan; SQL hanya identifier program (gt/rt/st/ct/ax, m<i>, a/r/p<i>), nilai tetap parameter binding. Spoofing/Elevation — body viewer D6 tidak berubah (strict, tanpa showAs); spec query bebas klien (specSchema) tidak mendapat showAs. Information disclosure — persen dihitung dari data yang sama yang sudah boleh dilihat widget itu (filter dashboard/Saring ikut). DoS — paling banyak 3 nilai × CTE tambahan (gt/rt/st/ct/ax) atas sumber yang sama; tetap di bawah timeout query/antrean yang ada.
- Rollback: revert commit; spec yang sudah menyimpan showAs akan ditolak validasi lama ("Pengaturan widget tidak valid") sampai pemilik memilih ulang — tidak ada migrasi DB.
- Validation: tests/features/query/show-as.test.ts (17 uji DuckDB sungguhan: AC1–AC5 + regresi SQL identik), tests/features/exports/job.test.ts (3 uji T-067 ekspor CSV/XLSX pivot + grafik, numFmt persen), tests/components/show-as-ui.test.ts (format 12,5%, markup, panel, ganti jenis), e2e pivot.spec.ts "T-067" (panel → % total kolom → total berjalan → nilai biasa); suite pivot + chart-polish hijau; aitk check hijau.

## Notes
- Keputusan (default aman, sesuai Q5): sumbu total berjalan/selisih otomatis = kolom pemisah, selain itu baris terdalam per kelompok induk; urut label naik (kunci kelompok, teks nocase.noaccent seperti urutan kolom).
- Urutan baris pivot "nilai terbesar/terkecil" tetap menurut agregat mentah Nilai 1 (bukan nilai yang ditampilkan); untuk % keseluruhan/kolom urutannya sama. Grafik mengurutkan dan memotong N teratas menurut nilai yang tampil.
- % selisih = (nilai − sebelumnya) / sebelumnya seperti Excel (tanpa abs); sebelumnya 0/NULL → kosong.
- Total berjalan pada sel tanpa data (nilai kosong) tetap kosong; total berjalan sesudahnya melewati item kosong (item "sebelumnya" = item yang ada).
- CSV menulis rasio mentah (0.125) dengan judul kolom yang menyebut cara tampil; XLSX angka bergaya 0.0%.
- Grafik: total untuk "Lainnya" pai = 100% (pct_grand); total berjalan/selisih tanpa "Lainnya" dan tanpa isi-0 periode kosong.
- Dilewati: rantai plugin frontend-expert dan /frontend-expert:audit tidak tersedia di sesi cloud ini — kontrol baru memakai komponen Choice yang sudah ada (pola sama dengan "Urutan"/"Rentang waktu"), tanpa ikon baru. e2e grafik showAs tidak ditambah (dicakup uji DuckDB + chart-polish regresi).
- Temuan di luar cakupan: e2e `widgets` AC 2 (KPI Rp) sudah gagal di base a4869d3 saat dijalankan sebagai suite (teks ringkas + lengkap), lolos sendiri — bukan dari task ini.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: verified — batas kepercayaan tetap: showAs hanya dari spec widget tersimpan (pemilik/editor), dihitung di DuckDB server; klien hanya memformat
- [x] V2 Authentication: N/A — tidak menyentuh autentikasi
- [x] V3 Session management: N/A — tidak menyentuh sesi
- [x] V4 Access control: verified — jalur akses widget (requireUser, peran dashboard, D6 viewer {widgetId, dashboardFilters}) tidak berubah; showAs tidak bisa dikirim viewer (body strict)
- [x] V5 Validation, sanitization and encoding: verified — showAs z.enum tertutup per jenis (pai hanya pct_grand, grafik tanpa pct_row/pct_col, KPI strict menolak), nilai non-angka ditolak INVALID; SQL hanya identifier program, nilai lewat binding; label React di-escape
- [x] V6 Stored cryptography: N/A — tidak ada data rahasia baru
- [x] V7 Error handling and logging: verified — pesan INVALID berbahasa Indonesia tanpa detail internal; pembagian 0/NULL → NULL, bukan galat
- [x] V8 Data protection: verified — cache hasil memuat showAs di kunci (tidak tertukar dengan hasil nilai biasa); tidak ada data pribadi baru
- [x] V9 Communication: N/A — tidak ada komunikasi eksternal baru
- [x] V10 Malicious code: verified — tanpa dependency baru atau panggilan jaringan
- [x] V11 Business logic: verified — persen dari seluruh data lolos filter (bukan baris tampil), item sebelum potongan ikut; diuji DuckDB
- [x] V12 Files and resources: N/A — tidak ada unggahan/path baru; XLSX hanya gaya numFmt baru
- [x] V13 API and web service: verified — skema body /api/query dan ekspor tidak berubah; spec widget divalidasi zod di server
- [x] V14 Configuration: verified — tanpa konfigurasi/env baru; npm audit hijau
