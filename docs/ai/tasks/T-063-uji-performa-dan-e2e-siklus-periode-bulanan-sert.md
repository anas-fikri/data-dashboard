---
id: T-063
title: Uji performa dan e2e siklus periode bulanan, serta runbook disk
status: in_progress
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
updated: "2026-10-21T03:23:11Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: fef8c190c705d95fd1dee0c3c233ba746f1cd930
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 203417
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792552920213,"service":"data-dashboard","host":"127.0.0.1","port":44671,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792552920268,"service":"data-dashboard","host":"127.0.0.1","port":39511,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792552920379,"service":"data-dashboard","host":"127.0.0.1","port":39979,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792552920511,"service":"data-dashboard","host":"127.0.0.1","port":45361,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792552930200,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792552937702,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792552937724,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792552937731,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792552937741,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  204 passed | 1 skipped (205)
            Tests  2688 passed | 10 skipped (2698)
         Start at  03:20:20
         Duration  137.94s (tests 85%, import 13%, transform 3%)

          Isolate  205 workers spawned · ~150ms startup each (spawn + environment, per file)
                   at least ~10.07s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T03:22:39Z"
    tree: b717f5d5cd3dfb19aa2d2c1c66b08bb0e018481d6038a9eb28d1b73443403af8
  audit:
    at: "2026-10-21T03:22:46Z"
    passed: true
    tree: b717f5d5cd3dfb19aa2d2c1c66b08bb0e018481d6038a9eb28d1b73443403af8
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 518 dirs visited, 4025 inodes visited, 1 Extract calls, 232.849001ms elapsed, 232.849635ms wall time
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
