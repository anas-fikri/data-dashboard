---
id: T-063
title: Uji performa dan e2e siklus periode bulanan, serta runbook disk
status: blocked
profile: standard
goal: G-6
tags:
  - perf
  - e2e
  - ops
depends_on:
  - T-055
  - T-056
  - T-057
  - T-058
  - T-059
  - T-023
  - T-024
created: "2026-10-15T02:30:59Z"
updated: "2026-10-21T03:27:15Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: fef8c190c705d95fd1dee0c3c233ba746f1cd930
paths:
  - docs/runbook-deploy.md
  - playwright.config.ts
  - scripts/perf-period-cycle-vm.sh
  - scripts/perf-period-cycle.ts
  - src/features/versions/cleanup.ts
  - src/features/versions/gc.ts
  - tests/e2e/period-cycle.spec.ts
  - tests/features/versions/cleanup.test.ts
  - tests/features/versions/integrity.test.ts
  - tests/scripts/perf-period-cycle-vm.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T03:23:32Z"
      findings: 3
    - "n": 2
      by: claude-code
      at: "2026-10-21T03:23:33Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 195765
    summary: |-
      …r: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792553169141,"service":"data-dashboard","host":"127.0.0.1","port":38409,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792553169200,"service":"data-dashboard","host":"127.0.0.1","port":38701,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792553169307,"service":"data-dashboard","host":"127.0.0.1","port":37287,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792553169414,"service":"data-dashboard","host":"127.0.0.1","port":36991,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792553176847,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792553189488,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792553189511,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792553189517,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792553189527,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  204 passed | 1 skipped (205)
            Tests  2688 passed | 10 skipped (2698)
         Start at  03:24:31
         Duration  136.77s (tests 85%, import 12%, transform 2%)

          Isolate  205 workers spawned · ~148ms startup each (spawn + environment, per file)
                   at least ~9.96s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T03:26:49Z"
    tree: b717f5d5cd3dfb19aa2d2c1c66b08bb0e018481d6038a9eb28d1b73443403af8
  commits:
    - 03a0095
    - 08ca5b4
    - 0cb153a
    - 0e22c88
    - "1220871"
    - 14bbbc8
    - "1781974"
    - 17d81a7
    - 18b74cc
    - 1b2b9ab
    - 23e5ae9
    - 258a139
    - 277b913
    - 27924c4
    - 27986dc
    - 29fe0f3
    - 2d7b316
    - 2d82efa
    - 2ed6480
    - 337259e
    - 35f92f6
    - 3602b55
    - 36afc9f
    - 3b96186
    - 3bb3baa
    - 4060d62
    - 4679db1
    - 49f49a5
    - 4ad60dc
    - 4bd9881
    - 4e9a95e
    - 4eea84c
    - 5101f51
    - 538221d
    - 5603fc7
    - 56a8447
    - 56e4d6d
    - 57df970
    - 58fdf0c
    - 59ec9a3
    - "6123427"
    - 62b718d
    - 62ec216
    - 65e370c
    - 686497c
    - 69b8953
    - 69fdcf7
    - 6a7cef1
    - 6b3ee3f
    - 70136f5
    - "7153066"
    - "7187327"
    - 75cf456
    - 76e3ce7
    - "7824e56"
    - 7ae2840
    - 7af4484
    - 7d64743
    - 7f238c4
    - 7f9a7c7
    - "8199692"
    - "8570e80"
    - 8c08ba4
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
    - 9ced9f4
    - 9f78595
    - a019f8f
    - a03481c
    - a0e1646
    - a5360dd
    - a687d4c
    - a8f9162
    - acb27a6
    - acf0247
    - ae4e5a2
    - af1994a
    - b0b99d8
    - b20b40b
    - b30aea5
    - b32d50d
    - b42141b
    - b8e59ee
    - b933279
    - ba2efef
    - bafb4ad
    - bcbddee
    - c15362c
    - c1a5b7f
    - c1c8b0a
    - c2fd95c
    - c3626c9
    - c751cbb
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
    - e2f1df7
    - e51fcb4
    - e94e670
    - edcbdff
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - f9d43c6
    - fae1c8b
    - fc288cb
    - fc87996
    - fef8c19
  acceptance:
    total: 4
    done: 3
  audit:
    at: "2026-10-21T03:26:50Z"
    passed: true
    tree: b717f5d5cd3dfb19aa2d2c1c66b08bb0e018481d6038a9eb28d1b73443403af8
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 518 dirs visited, 4049 inodes visited, 1 Extract calls, 221.413269ms elapsed, 221.413515ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-31, Fase 4. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given 24 unggahan bulanan 400 rb baris (ditambah 10 × 1 jt baris), then durasi unggahan ke-N ≤ 1,2× unggahan ke-1 dan byte objek baru per unggahan ≈ ukuran parquet periodenya, tercatat di docs/ai/perf/<task>.md
- [x] Given retensi + GC setelah 24 unggahan, then total storage ≈ data aktif + periode yang masih dirujuk versi tersimpan, dan job invarian lolos
- [x] Given e2e atur periode → tambah Jan, Feb → ganti Feb (lewat tinjauan) → keepPeriods=2 dengan EVICT_OLDEST → rollback → hapus → pulihkan, then KPI 'Jumlah baris' dan baris per periode sesuai di setiap langkah, dan alur REPLACE lama lolos tanpa mengubah helper
- [ ] Given backup harian T-023, then pertambahan backup per unggahan ≈ parquet periode itu, dan runbook memuat rumus ukuran disk (RustFS, cache app, tmp worker, cache urutan)

## Risk
Impact: hanya uji, skrip perf, dan dokumentasi (runbook §8); tidak ada perubahan kode aplikasi/skema.
Security (STRIDE): skrip perf menolak NODE_ENV=production; skrip VM hanya memakai stack uji terpisah
(project dashboard-perftest, database/storage/backup sendiri); runbook melarang prune dan hapus objek manual.
Rollback: revert commit (tidak ada migrasi).
Validation: e2e period-cycle, regresi versions (REPLACE) tanpa ubah helper, perf-period-cycle di container
cloud (dev DB + RustFS + worker sungguhan), aitk check.

## Notes
Objective (dari rencana P-31): buktikan siklus periode bulanan ujung-ke-ujung (e2e), ukur durasi unggahan
dan objek baru per unggahan pada ukuran realistis, buktikan storage setelah retensi + GC = data aktif +
yang dirujuk versi tersimpan, dan tulis runbook disk (RustFS, cache app, tmp worker, cache urutan, backup).

Hasil (container cloud, 4 vCPU, bukan VM — docs/ai/perf/T-063.md):
- AC1: 24 × 400 rb baris + 10 × 1 jt baris lewat jalur produksi utuh (initUpload → complete → antrean →
  worker sungguhan). Maks/ke-1 = 1,037 (400 rb, 22,7–23,6 s) dan 1,042 (1 jt, 47,7–49,9 s). Objek parquet
  baru / parquet periode = 1,000 di setiap unggahan periode; 0 objek lama berubah/hilang.
- AC2: setelah retensi + GC + storage-cleanup: storage 122,8 MB = aktif 102,3 + tersimpan 20,5 (rasio
  1,0000), 0 tak terujuk, segment-audit missing 0 / orphans 0.
- AC3: e2e `period-cycle` 1/1 (2,3 menit): KPI dashboard + baris per periode (metadata + /api/query
  kolom Periode) di setiap langkah: atur periode → Jan, Feb → ganti Feb lewat tinjauan → ganti Feb sebagai
  kelompok 3 file → simpan 2 + EVICT_OLDEST (Des, Jan dilepas utuh) → rollback → hapus Jan → pulihkan
  ditolak batas 2 periode → pengaturan bawaan → pulihkan → atur ulang per kuartal → rollback. Regresi
  REPLACE tanpa ubah helper: `versions` 7/7, `ingest` 4/4 (tests/e2e/helpers.ts tidak diubah).
- AC4 BELUM (butuh VM): rumus disk + backup ada di runbook §8; pertambahan backup dibuktikan dengan proksi
  (arsip = dump + bucket; per unggahan 400 rb ≈ 4,1 MB parquet setelah file asli 7 hari terhapus,
  ≈ 32,4 MB sebelum itu). Backup harian sungguhan: pemilik menjalankan
  `bash deploy/perf-stack.sh up 1 && bash scripts/perf-period-cycle-vm.sh <hasil>` (backup stack uji di
  titik 0,1,2,3,24,34,end → backup.tsv), lalu `perf-stack.sh down`; salin hasil ke docs/ai/perf/T-063-olympus/.
- Skrip: scripts/perf-period-cycle.ts (diuji dengan dijalankan penuh), scripts/perf-period-cycle-vm.sh
  (tests/scripts/perf-period-cycle-vm.test.ts dengan docker tiruan).
- Data perf dihapus di akhir putaran (dataset dihapus lewat deleteDataset); akun dev perf-cycle@ tetap
  (dev saja).
- Review putaran 1 (0 blocking): M1 job pemeliharaan berjam-maju di skrip perf mencakup semua dataset →
  runStorageCleanup/runRawRetention/runSegmentGc diberi parameter opsional `datasetId` (unit test), skrip
  memakainya; dampak putaran penuh di dev diperiksa: hanya dataset perf + T-061 ada, T-061 tanpa file asli
  dan segmennya tidak ditandai → tidak terdampak (rincian docs/ai/perf/T-063.md). L1 container siklus VM
  bernama dan dibuang di trap (diuji). L2 runbook §8 memeriksa volume sebelum `docker run -v`.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: hanya uji/skrip perf/dokumen; batas kepercayaan: skrip perf berjalan sebagai proses server di dev atau stack uji terpisah, bukan produksi
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi; akun uji e2e lewat helper yang ada, password tidak dicetak
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: tidak ada endpoint baru; e2e memakai jalur pemilik yang ada; skrip perf memanggil service dengan userId pemilik dataset
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak ada input pengguna baru; argumen skrip hanya dari operator
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data tersimpan baru; backup tetap age kunci publik
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: skrip tidak mencetak rahasia (.env tidak dibaca langsung; users.json hanya diambil email)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: data uji sintetis; dataset perf dihapus di akhir; stack uji dibongkar perf-stack.sh down
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi eksternal baru (storage internal di jaringan compose)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru; skrip VM hanya memanggil docker compose project dashboard-perftest (diuji docker tiruan)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: e2e membuktikan batas simpan periode menolak pulihkan yang melewati batas dan EVICT_OLDEST melepas periode utuh
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — verified: skrip perf menolak NODE_ENV=production; runbook melarang prune dan hapus objek manual di VM bersama
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: tanpa perubahan konfigurasi/default; aitk audit hijau

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T03:26:49Z (195765 ms)
- Acceptance criteria: 3/4 satisfied
- Commits: 03a0095, 08ca5b4, 0cb153a, 0e22c88, 1220871, 14bbbc8, 1781974, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 277b913, 27924c4, 27986dc, 29fe0f3, 2d7b316, 2d82efa, 2ed6480, 337259e, 35f92f6, 3602b55, 36afc9f, 3b96186, 3bb3baa, 4060d62, 4679db1, 49f49a5, 4ad60dc, 4bd9881, 4e9a95e, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 57df970, 58fdf0c, 59ec9a3, 6123427, 62b718d, 62ec216, 65e370c, 686497c, 69b8953, 69fdcf7, 6a7cef1, 6b3ee3f, 70136f5, 7153066, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8199692, 8570e80, 8c08ba4, 8f6ef33, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, 9ced9f4, 9f78595, a019f8f, a03481c, a0e1646, a5360dd, a687d4c, a8f9162, acb27a6, acf0247, ae4e5a2, af1994a, b0b99d8, b20b40b, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, bcbddee, c15362c, c1a5b7f, c1c8b0a, c2fd95c, c3626c9, c751cbb, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d4c2029, d557c9e, d602f56, da46e35, dfc2ebb, dff9b8c, e24e070, e2f1df7, e51fcb4, e94e670, edcbdff, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fae1c8b, fc288cb, fc87996, fef8c19
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-code: 0 findings
