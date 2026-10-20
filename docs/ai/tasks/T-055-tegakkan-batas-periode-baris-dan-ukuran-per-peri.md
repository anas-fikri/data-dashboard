---
id: T-055
title: Tegakkan batas periode, baris, dan ukuran per periode utuh, dengan meter dan proyeksi
status: in_progress
profile: standard
goal: G-6
tags:
  - limits
  - ui
depends_on:
  - T-054
  - T-039
created: "2026-10-15T02:30:58Z"
updated: "2026-10-20T15:36:46Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 35f92f6717a751b61edb895f5b117636e73530ad
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 198373
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792510547184,"service":"data-dashboard","host":"127.0.0.1","port":35033,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792510547247,"service":"data-dashboard","host":"127.0.0.1","port":33333,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792510547350,"service":"data-dashboard","host":"127.0.0.1","port":37765,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792510547467,"service":"data-dashboard","host":"127.0.0.1","port":44041,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792510555401,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792510568401,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792510568424,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792510568427,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792510568435,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  187 passed | 1 skipped (188)
            Tests  2434 passed | 10 skipped (2444)
         Start at  15:34:20
         Duration  136.74s (tests 84%, import 13%, transform 3%)

          Isolate  188 workers spawned · ~158ms startup each (spawn + environment, per file)
                   at least ~9.75s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T15:36:38Z"
    tree: 72d60dd49e86bfc3836e578b3aeffc2f9d317283f76926be6d1a91551daaa6ba
  audit:
    at: "2026-10-20T15:32:47Z"
    passed: true
    tree: 72d60dd49e86bfc3836e578b3aeffc2f9d317283f76926be6d1a91551daaa6ba
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 501 dirs visited, 3051 inodes visited, 1 Extract calls, 218.554948ms elapsed, 218.55514ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-23, Fase 3. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given batas 24 periode / 10 jt baris per sheet / 16 GiB per dataset, when unggahan melewati batas dengan EVICT_OLDEST, then periode terlama dilepas utuh di semua sheet, pelepasannya tampil di tinjauan, dan tidak ada baris yang dipotong; dengan REJECT, unggahan ditolak dengan menyebut nama periodenya
- [x] Given satu periode melebihi batas, then unggahan ditolak dengan jumlah baris dan batasnya, dan data aktif tidak berubah
- [x] Given pemakaian ≥ 80% batas mana pun, then kartu Periode dan panel unggah menampilkan meter ('18 dari 24 periode · 8,2 jt dari 10 jt baris · 11,3 dari 16 GB'), proyeksi ('Dengan rata-rata 1,0 jt baris per bulan, dataset ini menyimpan ±10 bulan'), dan perkiraan dari ukuran file saat init (hanya peringatan, tidak memblokir)

Inti (§4.5, §5.1–5.5): batas dievaluasi per periode utuh di tiga titik — init (sebelum byte pertama),
worker (setelah baca, sebelum typing), dan commit (dihitung ulang di bawah lock) — dengan meter + proyeksi
jujur di kartu Periode dan panel unggah saat pemakaian ≥ PERIOD_WARN_PCT.

## Risk
- Impact: init unggahan periode (query tambahan di transaksi init), halaman dataset periode (query
  kapasitas), panel unggah (perkiraan + meter). Penegakan worker/commit (T-050/T-052) tidak diubah.
- Security (STRIDE): Tampering/EoP — semua angka dihitung server dari DB untuk dataset milik pemilik
  (initUpload/periodUploadContext sudah scope ownerId); klien tidak mengirim angka batas. DoS — query
  kapasitas terbatas pada manifest versi aktif (≤ PERIOD_SHEET_MAX_SEGMENTS per sheet) + ≤ 10 versi riwayat.
- Rollback: revert commit; tanpa migrasi. Kode `PERIOD_LIMIT` init hanya muncul pada mode label.
- Validation: unit period-capacity (10), init-period (+2), period-ingest (+2); e2e period-limits 2/2,
  period-review 6/6, period-upload 4/4, period-upload-panel 2/2.

## Notes
- Keputusan (standar aman):
  - Penegakan pasti tetap di worker (jumlah baris tepat, sebelum typing) dan commit (rencana dihitung ulang
    dari data aktif + pengaturan saat itu di bawah lock; rencana beku/`autoActivate` tidak pernah
    dipercaya — T-050/T-052). T-055 menambah uji regresi: EVICT_OLDEST melepas Januari utuh (manifest
    tanpa Januari, baris periode lain utuh); satu periode > batas baris → FAILED dengan "berisi 30 baris
    di satu sheet, melebihi batas 20 baris per sheet", tanpa commit/segmen/objek.
  - Init (sebelum byte pertama): satu-satunya penolakan PASTI = unggahan label pada dataset yang semua
    sheet-nya berlabel (periode file diketahui) yang melewati batas jumlah periode / periode per sheet
    (`PERIOD_LIMIT`, pesan dari computePeriodPlan dengan baris 0 — baris tambahan hanya memperburuk).
    Baris/byte di init hanya PERKIRAAN (AC3: tidak memblokir): rasio byte/baris ≤ 10 unggahan terakhir
    berjenis sama (REPLACE = baris sheet, PERIOD = baris segmen yang ditulisnya), byte parquet = ukuran
    file × PARQUET_RATIO. Kuota tetap ditegakkan di init (T-039).
  - Meter/proyeksi memakai computePeriodPlan atas data aktif (angka meter = angka penegakan) +
    capacityProjection T-051; tampil hanya bila ada batas ≥ PERIOD_WARN_PCT. Batas "periode per sheet"
    hanya disebut di baris meter bila mendekati.
  - Perkiraan init ditampilkan panel selama unggahan dan sesudahnya (unggahan yang dilanjutkan tidak
    menghitung ulang; perkiraan sebelumnya dipertahankan di tab yang sama).
- Tidak dicek: tampilan meter di ponsel dengan axe (komponen kotak teks biasa, pola sama dengan banner
  T-054); kuota pengguna tidak ikut di baris meter (AC tidak memintanya; contoh §5.4 menyebutnya).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: batas kepercayaan = route init (/api/uploads) + halaman dataset; angka kapasitas dihitung server dari DB, klien hanya menampilkan
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi; route memakai uploadRoute (requireUser) seperti sebelumnya
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: periodInitCheck dipanggil setelah dataset di-scope ownerId di initUpload; loadPeriodCapacity lewat periodUploadContext yang di-scope ownerId (lainnya null)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: masukan init tetap validateInit (ukuran, nama, label); query Prisma berparameter, tanpa SQL dari klien; teks dirender React (ter-escape)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: pesan PERIOD_LIMIT/perkiraan hanya memuat label periode dan angka batas, Bahasa Indonesia
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: hanya jumlah baris/byte/kunci periode; tanpa isi data
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tanpa jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru, tanpa panggilan jaringan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: batas per periode utuh ditegakkan di worker + commit (dihitung ulang di bawah lock); init hanya menolak yang pasti, perkiraan tidak memblokir; uji regresi EVICT/TOO_LARGE
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — verified: batas ukuran/jenis file tidak berubah; penolakan label terjadi sebelum multipart dibuat
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: InitOk menambah field `estimate` (keluaran); kode PERIOD_LIMIT → HTTP 409; rate limit uploadInit tetap
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: tanpa env baru; memakai batas env §5.2 yang ada
