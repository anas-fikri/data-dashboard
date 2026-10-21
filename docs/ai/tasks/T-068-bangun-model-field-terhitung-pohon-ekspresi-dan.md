---
id: T-068
title: Bangun model field terhitung (pohon ekspresi) dan pembangun SQL aman
status: in_progress
profile: strict
profile_pinned: true
goal: G-7
tags:
  - security
  - query
depends_on:
  - T-067
created: "2026-10-21T10:24:07Z"
updated: "2026-10-21T13:23:44Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 693edf2b16e5136b39628ff0649a500c95017a35
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 224323
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792588950149,"service":"data-dashboard","host":"127.0.0.1","port":44575,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792588950212,"service":"data-dashboard","host":"127.0.0.1","port":42445,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792588950319,"service":"data-dashboard","host":"127.0.0.1","port":43695,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792588950426,"service":"data-dashboard","host":"127.0.0.1","port":39095,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792588960437,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792588978015,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792588978038,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792588978041,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792588978053,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  210 passed | 1 skipped (211)
            Tests  2789 passed | 10 skipped (2799)
         Start at  13:20:40
         Duration  154.53s (tests 84%, import 13%, transform 2%)

          Isolate  211 workers spawned · ~167ms startup each (spawn + environment, per file)
                   at least ~11.60s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T13:23:16Z"
    tree: ec32cfd4064c73e6543d8a0947f660d491ed087fbd92413ae71a137d3ff0e914
  audit:
    at: "2026-10-21T13:23:17Z"
    passed: true
    tree: ec32cfd4064c73e6543d8a0947f660d491ed087fbd92413ae71a137d3ff0e914
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 519 dirs visited, 4442 inodes visited, 1 Extract calls, 252.702417ms elapsed, 252.702804ms wall time
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
Field terhitung antar ukuran teragregasi disimpan sebagai pohon ekspresi JSON tervalidasi (ADR-0009), bukan teks SQL; dikompilasi server di atas measureExpr dengan pembagian aman. Dipakai pivot, grafik, KPI, dan (lewat pivot tersimpan) tabel. Rencana G-7 §3.2, §4.1.

## Acceptance criteria
- [x] Given nilai {kind:'calc', label:'Margin', expr: div(sub(sum Pendapatan, sum Biaya), sum Pendapatan)} pada pivot Wilayah, when dimuat, then sel, subtotal, total baris/kolom, dan total keseluruhan = (Σpendapatan − Σbiaya)/Σpendapatan dari agregat masing-masing (bukan jumlah margin per baris), teruji terhadap fixture kecil dengan nilai yang dihitung manual
- [x] Given pembagi 0 atau NULL di sel mana pun (mis. rata-rata per kiriman = sum(pendapatan)/count(kiriman) pada kelompok tanpa kiriman), then sel bernilai NULL (tampil '–'), tidak ada error DuckDB, tidak ada Infinity/NaN di JSON, dan sel lain tetap benar
- [x] Given body/spec dengan teks SQL, operator di luar enum (add, sub, mul, div, neg), > 32 node, kedalaman > 6, > 8 agregat unik, konstanta tidak berhingga atau |x| > 1e15, agregat tidak cocok tipe kolom (sum teks), atau kolom tersembunyi, when disimpan/di-query, then ditolak zod/resolve dengan pesan Indonesia (400/INVALID), konstanta selalu di-bind parameter, identifier hanya c<pos> dari skema; test injeksi (nama kolom berisi kutip/;--) lolos
- [x] Given field terhitung yang semua daunnya DECIMAL dan hanya +/− , then hasil DECIMAL(38,6) tanpa float; dengan ÷ atau × konstanta non-bulat, then DOUBLE; showAs T-067 berlaku pada field terhitung; urut value_* dan Top N memakai nilai terhitung
- [x] Given remap versi (widgets/remap.ts, columnsOf) dan aktivasi/rollback, then kolom di dalam ekspresi ikut dipetakan; kolom yang hilang → MISSING_COLUMN dan pesan 'kolom tidak ada di data terbaru' per widget; checklist ASVS V5 (validasi input) dan review keamanan tercatat

## Risk
Impact: jalur query widget (pivot/grafik/KPI) — measureExpr, buildSql/buildTotalsSql/buildPivotSql, widgetPlan, resolveSpec, remap versi, render nilai (format per nilai). Spec lama tanpa `kind` tidak berubah: SQL, rencana, dan kunci cache identik dengan HEAD 693edf2 (golden di tests/features/query/calc.test.ts).
Security (STRIDE): Tampering/Elevation — tidak ada teks SQL dari klien: pohon ekspresi JSON tervalidasi (operator enum tertutup, kunci asing ditolak, ≤ 32 node, kedalaman ≤ 6 dicek iteratif sebelum rekursi, ≤ 8 agregat unik, konstanta berhingga |x| ≤ 1e15) dan selalu di-bind sebagai parameter `$m<i>k<n>`; identifier hanya `c<pos>` dari skema lewat resolveSpec (nama kolom berisi kutip/;-- diuji). Information disclosure — kolom tersembunyi di daun rumus → COLUMN_UNAVAILABLE (viewer: pesan umum lewat forRole), D6 viewer tidak berubah (rumus hanya dari spec tersimpan). DoS — batas bentuk + node pohon berhenti di 33 node; overflow DOUBLE → NULL (finite guard). Spoofing/Repudiation: tidak berubah (tidak ada endpoint baru).
Rollback: revert commit T-068; spec tanpa `kind:"calc"` tidak tersentuh. Widget yang sudah menyimpan field terhitung akan ditolak validasi setelah revert (pesan "Pengaturan widget tidak valid"), jadi rollback setelah UI T-069 dirilis perlu hapus/ganti nilai terhitung itu.
Validation: tests/features/widgets/calc.test.ts (validasi, resolve, remap, teks rumus) + tests/features/query/calc.test.ts (DuckDB: AC1 nilai manual, AC2 ÷0/NULL, AC3 parameter/injeksi, AC4 DECIMAL vs DOUBLE + showAs + urut/Top N + ekspor, golden spec lama, uji properti 300 pohon acak vs evaluator JS); aitk check.

## Notes
- Keputusan: pembagian dikompilasi `n / d` (DOUBLE) lalu dijaga berhingga `list_filter([x], lambda v: isfinite(v))[1]` → penyebut 0/NULL dan overflow = NULL. NULLIF/CASE tidak dipakai: DuckDB menguraikannya menjadi CASE yang menyalin operand sehingga rumus 6 tingkat macet di perencana (ditemukan uji properti; ada uji regresi). Dicatat sebagai amandemen ADR-0009.
- Jenis hasil: hanya +/−/negatif atas daun tepat (DECIMAL tidak-float, bilangan bulat) dengan konstanta bulat → tepat (DECIMAL(38,6) atau bilangan bulat); ÷, ×, konstanta pecahan, rata-rata, kolom DOUBLE → DOUBLE.
- showAs berlaku pada field terhitung (semua cara, seperti Excel); KPI tanpa showAs. Pai hanya untuk rumus aditif (±Total/Jumlah baris tanpa konstanta) agar irisan "Lainnya" benar; total grafik "N teratas dari M" untuk rumus non-aditif = kosong (seperti rata-rata).
- Format per nilai (`format` opsional pada field terhitung) dipakai pivot, grafik, KPI, ekspor (persen → sel XLSX persen untuk pivot, grafik, dan KPI; Rupiah → angka biasa seperti ukuran biasa).
- Kolom durasi ditolak sebagai daun rumus (kecuali jumlah terisi/unik) dengan pesan jelas — hasil rumus tampil sebagai angka, detik mentah menyesatkan.
- Ganti jenis batang ↔ garis di sheet yang sama mempertahankan field terhitung; ke pai/KPI/pivot/tabel kembali ke ukuran bawaan (penyusun rumus T-069).
- Review putaran 1: 0 blokir; M1 (format XLSX grafik/KPI), L2 (durasi), L3 (batang↔garis) diperbaiki.
- Tabel: widget tabel baris mentah tidak punya ukuran; field terhitung di tabel teragregasi datang lewat pivot tersimpan (T-073).
- UI: panel hanya menampilkan rumus (baca-saja) + hapus nilai; penyusun rumus = T-069.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: batas = spec widget tersimpan (pemilik/editor menulis lewat checkConfig→widgetPlan); viewer tetap {widgetId, dashboardFilters} (D6), rumus hanya dibaca server dari DB; Risk/STRIDE dicatat.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: tidak ada endpoint baru; jalur akses widget/dashboard yang ada tidak berubah; kolom tersembunyi di daun rumus → COLUMN_UNAVAILABLE (pesan umum untuk viewer lewat forRole).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: pohon ekspresi divalidasi (operator enum, kunci asing ditolak, ≤32 node/kedalaman ≤6 iteratif sebelum rekursi, ≤8 agregat unik, konstanta berhingga |x|≤1e15), daun lewat resolveSpec (AGG_TYPES, angka saja), identifier hanya c<pos>, konstanta parameter $m<i>k<n>; uji injeksi nama kolom berkutip/;-- dan pohon jahat di tests/features/{widgets,query}/calc.test.ts.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia/kriptografi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: galat validasi = pesan Indonesia (INVALID/COLUMN_UNAVAILABLE), ÷0/NULL/overflow → NULL bukan galat DuckDB; tidak ada log baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: cache hasil tetap per versi/spec (rumus masuk kunci lewat QuerySpec); tidak ada data baru yang disimpan selain spec widget.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi keluar baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tidak ada dependensi baru; aitk audit.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: batas bentuk mencegah query raksasa; rumus 32 node/6 tingkat diuji cepat (<5 s) di pivot 2 level (regresi ledakan perencana).
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: spec widget + spec query bebas divalidasi zod (measureOrCalc/measureSchema, strict); keluaran JSON tanpa Infinity/NaN (diuji).
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada perubahan konfigurasi.
