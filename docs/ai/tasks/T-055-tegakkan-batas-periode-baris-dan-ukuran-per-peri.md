---
id: T-055
title: Tegakkan batas periode, baris, dan ukuran per periode utuh, dengan meter dan proyeksi
status: done
profile: standard
goal: G-6
tags:
  - limits
  - ui
depends_on:
  - T-054
  - T-039
created: "2026-10-15T02:30:58Z"
updated: "2026-10-20T15:48:02Z"
closed: "2026-10-20T15:48:02Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 35f92f6717a751b61edb895f5b117636e73530ad
paths:
  - playwright.config.ts
  - src/app/(app)/datasets/[id]/page.tsx
  - src/components/datasets/period-usage.tsx
  - src/components/datasets/upload-panel.tsx
  - src/features/ingest/period-capacity.ts
  - src/features/ingest/period-setup-plan.ts
  - src/features/uploads/client.ts
  - src/features/uploads/http.ts
  - src/features/uploads/service.ts
  - src/features/versions/period-capacity.ts
  - src/features/versions/period-upload.ts
  - tests/e2e/period-limits.spec.ts
  - tests/features/ingest/period-capacity.test.ts
  - tests/features/ingest/period-ingest.test.ts
  - tests/features/uploads/init-period.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T15:44:20Z"
      findings: 4
    - "n": 2
      by: claude-code
      at: "2026-10-20T15:44:21Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 193578
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792511202761,"service":"data-dashboard","host":"127.0.0.1","port":45483,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792511202815,"service":"data-dashboard","host":"127.0.0.1","port":46647,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792511202910,"service":"data-dashboard","host":"127.0.0.1","port":32847,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792511203024,"service":"data-dashboard","host":"127.0.0.1","port":35139,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792511213539,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792511222612,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792511222634,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792511222637,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792511222652,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  187 passed | 1 skipped (188)
            Tests  2437 passed | 10 skipped (2447)
         Start at  15:45:18
         Duration  134.95s (tests 84%, import 13%, transform 3%)

          Isolate  188 workers spawned · ~155ms startup each (spawn + environment, per file)
                   at least ~9.56s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T15:47:35Z"
    tree: 28f8695f06be46d78d7c90dbc8e10c8da18063d402a3076ee04ba5b7e26ba573
  commits:
    - 08ca5b4
    - 0cb153a
    - "1220871"
    - 14bbbc8
    - 17d81a7
    - 18b74cc
    - 1b2b9ab
    - 23e5ae9
    - 258a139
    - 27924c4
    - 27986dc
    - 29fe0f3
    - 2d7b316
    - 337259e
    - 35f92f6
    - 3602b55
    - 36afc9f
    - 3b96186
    - 3bb3baa
    - 49f49a5
    - 4bd9881
    - 4e9a95e
    - 4eea84c
    - 5101f51
    - 538221d
    - 5603fc7
    - 56a8447
    - 56e4d6d
    - 59ec9a3
    - "6123427"
    - 62ec216
    - 686497c
    - 69b8953
    - 6a7cef1
    - 6b3ee3f
    - 70136f5
    - "7187327"
    - 75cf456
    - 76e3ce7
    - "7824e56"
    - 7ae2840
    - 7af4484
    - 7d64743
    - 7f238c4
    - 7f9a7c7
    - "8570e80"
    - 8f6ef33
    - 8f8df38
    - 8fc3abc
    - 90e4e63
    - 9159d7c
    - "9298e14"
    - 930dd6d
    - 94bea50
    - 94d85a4
    - 9bd7e54
    - a019f8f
    - a03481c
    - a0e1646
    - a687d4c
    - a8f9162
    - acb27a6
    - ae4e5a2
    - af1994a
    - b0b99d8
    - b30aea5
    - b32d50d
    - b42141b
    - b8e59ee
    - b933279
    - ba2efef
    - bafb4ad
    - c15362c
    - c1c8b0a
    - c2fd95c
    - c3626c9
    - c76c343
    - ca5782f
    - ccd0a9a
    - ce26ca5
    - ce5d6a7
    - ce649d0
    - cf28ad3
    - cf730c5
    - d32a8ea
    - d4c2029
    - d557c9e
    - d602f56
    - da46e35
    - dfc2ebb
    - dff9b8c
    - e24e070
    - e51fcb4
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - f9d43c6
    - fc288cb
    - fc87996
  acceptance:
    total: 3
    done: 3
  audit:
    at: "2026-10-20T15:47:36Z"
    passed: true
    tree: 28f8695f06be46d78d7c90dbc8e10c8da18063d402a3076ee04ba5b7e26ba573
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 502 dirs visited, 3107 inodes visited, 1 Extract calls, 226.003743ms elapsed, 226.003892ms wall time
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
- Review putaran 1 (1 blokir): #1 meter memakai rencana REJECT (data aktif apa adanya) walau pemilik memilih
  EVICT_OLDEST — sebelumnya "12 dari 12" untuk 24 periode aktif dengan Simpan 12; #2 init hanya menolak
  batas jumlah periode (periode per sheet diputuskan worker); #3 perkiraan baris = seluruh file, hanya
  dibandingkan dengan batas per sheet pada dataset satu sheet; #4 perkiraan di wilayah live sopan.
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

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T15:47:35Z (193578 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 337259e, 35f92f6, 3602b55, 36afc9f, 3b96186, 3bb3baa, 49f49a5, 4bd9881, 4e9a95e, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 59ec9a3, 6123427, 62ec216, 686497c, 69b8953, 6a7cef1, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8570e80, 8f6ef33, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, a019f8f, a03481c, a0e1646, a687d4c, a8f9162, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, c15362c, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d4c2029, d557c9e, d602f56, da46e35, dfc2ebb, dff9b8c, e24e070, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 4 findings
- Review pass 2 by claude-code: 0 findings
