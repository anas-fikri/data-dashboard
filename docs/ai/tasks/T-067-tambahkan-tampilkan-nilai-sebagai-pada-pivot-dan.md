---
id: T-067
title: Tambahkan Tampilkan nilai sebagai pada pivot dan grafik
status: done
profile: strict
profile_pinned: true
goal: G-7
tags:
  - query
  - ui
depends_on:
  - T-066
created: "2026-10-21T10:24:05Z"
updated: "2026-10-21T11:39:35Z"
closed: "2026-10-21T11:39:35Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: a4869d3237d790f51047e944cbbb789feb030082
paths:
  - .prettierignore
  - Dockerfile
  - deploy/deploy.sh
  - deploy/images.sh
  - deploy/upgrade.sh
  - docker-compose.prod.yml
  - docs/panduan-developer.md
  - docs/runbook-deploy.md
  - renderer/Dockerfile
  - renderer/server.ts
  - renderer/version.ts
  - src/app/(app)/layout.tsx
  - src/app/health/page.tsx
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/pivot-config-model.ts
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/shell/account-menu.tsx
  - src/components/shell/app-shell.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/pivot-markup.tsx
  - src/components/widgets/widget-query.ts
  - src/features/exports/job.ts
  - src/features/exports/pivot.ts
  - src/features/exports/xlsx.ts
  - src/features/query/pivot.ts
  - src/features/query/service.ts
  - src/features/query/spec.ts
  - src/features/query/sql.ts
  - src/features/query/widget.ts
  - src/features/widgets/pivot-table.ts
  - src/features/widgets/show-as.ts
  - src/features/widgets/spec.ts
  - src/lib/health/index.ts
  - src/lib/version.ts
  - src/worker/index.ts
  - tests/components/show-as-ui.test.ts
  - tests/e2e/health.spec.ts
  - tests/e2e/pivot.spec.ts
  - tests/e2e/shell.spec.ts
  - tests/features/exports/fixtures.ts
  - tests/features/exports/job.test.ts
  - tests/features/query/show-as.test.ts
  - tests/lib/health.test.ts
  - tests/lib/version.test.ts
  - tests/scripts/images-tag.test.ts
  - tests/scripts/upgrade-gates.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T11:35:22Z"
      findings: 4
    - "n": 2
      by: claude-code
      at: "2026-10-21T11:35:23Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 223668
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792582700761,"service":"data-dashboard","host":"127.0.0.1","port":34947,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792582700812,"service":"data-dashboard","host":"127.0.0.1","port":37987,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792582700911,"service":"data-dashboard","host":"127.0.0.1","port":36199,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792582701045,"service":"data-dashboard","host":"127.0.0.1","port":40987,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792582710623,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792582724016,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792582724040,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792582724043,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792582724058,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  208 passed | 1 skipped (209)
            Tests  2729 passed | 10 skipped (2739)
         Start at  11:36:28
         Duration  157.32s (tests 84%, import 13%, transform 3%)

          Isolate  209 workers spawned · ~168ms startup each (spawn + environment, per file)
                   at least ~11.54s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.0.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T11:39:07Z"
    tree: ef8f19a7e4e928555b2d50f903a9854dae9d6aa3177f2ca7a15a6843af274d9f
  commits:
    - 14e93e4
    - 20985af
    - 60920fa
    - a4869d3
    - f9bd2d5
  acceptance:
    total: 5
    done: 5
  audit:
    at: "2026-10-21T11:39:08Z"
    passed: true
    tree: ef8f19a7e4e928555b2d50f903a9854dae9d6aa3177f2ca7a15a6843af274d9f
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 519 dirs visited, 4337 inodes visited, 1 Extract calls, 228.157419ms elapsed, 228.157781ms wall time
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
- Item "sebelumnya" = kelompok yang ada di data sebelumnya (kombinasi tanpa baris sama sekali dilewati). Kelompok yang ada tetapi nilainya kosong (mis. rata-rata atas sel kosong semua): total berjalan meneruskan angka sebelumnya (contoh uji: Apr kosong → 15), selisih/% selisih sel itu kosong, dan selisih item sesudahnya juga kosong karena sebelumnya NULL (bukan melompat ke item berisi terakhir).
- Pivot tanpa kolom pemisah tidak menawarkan "% dari total baris" (selalu 100%); menghapus pemisah mengembalikan nilai ber-% baris ke nilai biasa. Spec lama ber-pct_row tanpa pemisah tetap valid di server (100%).
- Petunjuk panel untuk % pada rata-rata/min/maks/jumlah unik: "dibagi <agregat> yang sama atas seluruh data", bukan "total".
- CSV menulis rasio mentah (0.125) dengan judul kolom yang menyebut cara tampil ("% dari total kolom · Total Omzet", diuji job.test.ts); XLSX angka bergaya 0.0%.
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

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T11:39:07Z (223668 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 14e93e4, 20985af, 60920fa, a4869d3, f9bd2d5
- Review pass 1 by claude-reviewer-subagent: 4 findings
- Review pass 2 by claude-code: 0 findings
