---
id: T-050
title: Hitung rencana periode dan batas sebagai fungsi murni computePeriodPlan
status: in_progress
profile: standard
goal: G-6
tags:
  - data-integrity
  - test
depends_on:
  - T-049
created: "2026-10-15T02:30:57Z"
updated: "2026-10-20T11:36:50Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 538221dfda50cca34d66837fc1f93e3e102a0f45
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 192231
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792496119816,"service":"data-dashboard","host":"127.0.0.1","port":37085,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792496119875,"service":"data-dashboard","host":"127.0.0.1","port":38597,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792496119978,"service":"data-dashboard","host":"127.0.0.1","port":45261,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792496120093,"service":"data-dashboard","host":"127.0.0.1","port":34215,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792496128604,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792496138665,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792496138689,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792496138695,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792496138706,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  175 passed | 1 skipped (176)
            Tests  2278 passed | 10 skipped (2288)
         Start at  11:34:01
         Duration  134.96s (tests 84%, import 13%, transform 3%)

          Isolate  176 workers spawned · ~156ms startup each (spawn + environment, per file)
                   at least ~8.97s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T11:36:18Z"
    tree: 09c00916c944edccc1cb7d148e8aa98589a34eaf45910a4b9561034b99d01feb
  audit:
    at: "2026-10-20T11:36:24Z"
    passed: true
    tree: 09c00916c944edccc1cb7d148e8aa98589a34eaf45910a4b9561034b99d01feb
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 483 dirs visited, 2574 inodes visited, 1 Extract calls, 271.330306ms elapsed, 271.330545ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-18, Fase 3. Perkiraan 2 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given periode aktif, periode file baru, pengaturan dataset, dan batas env, when computePeriodPlan dijalankan, then hasilnya daftar periode ditambah/diganti/dilepas/dikecualikan/ditolak beserta baris sebelum → sesudah, tanpa pernah menyisakan periode sebagian
- [x] Given batas terlewati dengan onLimit=EVICT_OLDEST, then yang dilepas adalah periode terlama menurut kunci periode, utuh, dan tidak pernah periode dari unggahan ini; given onLimit=REJECT (default), then PERIOD_LIMIT beserta periode yang harus dihapus pemilik
- [x] Given satu periode melebihi batas, atau periode lebih tua dari periode tertua saat jendela penuh, then PERIOD_TOO_LARGE/PERIOD_OUT_OF_WINDOW tanpa ada periode yang dilepas
- [x] Given uji berbasis properti ≥ 1.000 kasus acak, then semua invarian selalu terpenuhi dan rencana dibekukan (JSON) di versi

## Risk
Impact: kode baru murni (src/features/ingest/period-plan.ts) belum dipanggil jalur produksi — pemanggil
dipasang di T-052 (ingest periode) dan T-054/T-055 (tinjauan, meter). Migrasi aditif `DatasetVersion.plan
JSONB` (nullable). Env baru PERIOD_* / DATASET_MAX_DATA_BYTES dengan default rencana §5.2.
Security (STRIDE): Tampering — rencana beku divalidasi zod saat ditulis dan dibaca (fail-closed: bentuk
lain → null), hanya versi non-terminal yang boleh ditulis; DoS — batas periode/baris/byte/segmen
ditegakkan per periode utuh sebelum aktivasi; tidak ada input pengguna langsung, SQL, atau I/O.
Rollback: revert commit; `ALTER TABLE "DatasetVersion" DROP COLUMN "plan";` (belum ada penulis di produksi).
Validation: unit Vitest period-plan (contoh AC1–3 + 1.500 kasus acak berbenih, juga lulus 30.000 kasus
lokal), period-plan-store (mock prisma), env; `aitk check`.

## Notes

- Keputusan (standar aman, bisa diubah pemilik):
  - Yang dilepas/dihapus selalu awalan TERKECIL daftar periode terurut kunci (terlama dulu) yang membuat
    sisanya muat di semua batas (jumlah periode, baris per sheet, byte dataset, segmen per sheet).
  - Urutan putusan: periode unggahan ini sendiri tidak muat → PERIOD_TOO_LARGE (termasuk file berisi lebih
    banyak periode dari batas simpan); awalan memuat periode unggahan ini → PERIOD_OUT_OF_WINDOW (juga
    dengan REJECT, dan juga bila periode tertua yang diganti sendiri akan terlepas); REJECT → PERIOD_LIMIT +
    mustRemove (minimal; teruji: menghapusnya membuat unggahan muat, satu kurang tidak cukup);
    EVICT_OLDEST → awalan dilepas (selalu `confirm: EVICT`).
  - Periode yang diganti hanya diganti di sheet yang ada di file (`incomingSheets`); sheet di file tanpa
    baris untuk periode itu menjadi kosong (dihitung menyusut). Sheet lain mempertahankan data lama (§4.6).
  - Periode aktif yang baris file-nya dikecualikan sebagai nyasar tetap data lama, jadi boleh dilepas
    karena batas (entri EVICTED dengan `stray: true`).
  - Penyusutan dihitung per sheet: (sebelum − sesudah) × 100 > sebelum × PERIOD_SHRINK_CONFIRM_PCT.
  - `keep = min(keepPeriods ?? PERIOD_KEEP_DEFAULT, PERIOD_KEEP_MAX)`.
- Untuk T-052: panggil `computePeriodPlan` dengan rows/bytes per lineage; bytes boleh perkiraan untuk
  penolakan awal; bekukan dengan `freezePeriodPlan(versionId, plan)` (hanya non-terminal). Pengaturan
  dataset `keepPeriods/onLimit` belum punya kolom — dibuat oleh T-051 (Atur periode).
- Untuk T-052/T-055 (review T-050): jangan pernah memercayai `autoActivate` (atau rencana apa pun) dari
  rencana beku tanpa menghitung ulang dengan data aktif saat ini; saat "Terapkan", bandingkan rencana hasil
  hitung ulang dengan rencana yang dikonfirmasi pemilik — beda yang merusak → PLAN_STALE + konfirmasi ulang.
- Review putaran 1 (0 blokir): M1 pesan/limit penolakan kini dari batas yang mengikat (awalan k−1), bukan
  batas pertama proyeksi penuh (uji probe ditambahkan); L2 cek OUT_OF_WINDOW independen via `fits`; L3
  invarian nyasar/autoActivate ditambahkan.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: fungsi murni tanpa I/O; satu-satunya batas kepercayaan = kolom DatasetVersion.plan, divalidasi zod saat tulis dan baca
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak ada endpoint/kredensial baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A — belum ada Server Action/Route; pemanggil (T-052/T-054) wajib requireUser + cek pemilik
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: masukan divalidasi (kunci cocok satuan, tanggal ada, angka bulat ≥ 0, sheet ⊆ file); rencana beku diparse zod fail-closed; tanpa SQL
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: pesan penolakan Bahasa Indonesia hanya memuat label periode dan angka batas, tanpa internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: rencana hanya memuat kunci periode, jumlah baris/byte, lineageId, sha256 file — tanpa isi data
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tanpa jaringan
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru (PRNG uji ditulis sendiri), tanpa panggilan jaringan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: batas ditegakkan per periode utuh, periode unggahan tidak pernah dilepas, penolakan tidak melepas apa pun, rencana hanya ditulis ke versi non-terminal; 1.500 kasus acak
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak menangani file
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — tanpa API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: env baru punya default aman (§5.2) dan rentang zod; diuji di tests/lib/env.test.ts
