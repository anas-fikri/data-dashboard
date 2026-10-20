---
id: T-056
title: 'Kelola daftar periode: unggah ulang, hapus, pulihkan, riwayat berlabel'
status: done
profile: strict
goal: G-6
tags:
  - ui
  - data-safety
  - security
depends_on:
  - T-054
created: "2026-10-15T02:30:58Z"
updated: "2026-10-20T16:45:28Z"
closed: "2026-10-20T16:45:28Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 57df97085e3c2c28ae8e0de45b17bd7dbf025a81
paths:
  - playwright.config.ts
  - prisma/migrations/20261020210000_t056_segment_uploader/migration.sql
  - prisma/schema.prisma
  - src/app/(app)/datasets/[id]/page.tsx
  - src/components/datasets/period-list-actions.tsx
  - src/components/datasets/period-list.tsx
  - src/components/datasets/upload-panel.tsx
  - src/components/datasets/version-history-actions.tsx
  - src/components/datasets/version-history-confirm.tsx
  - src/components/datasets/version-history-mapping.tsx
  - src/components/datasets/version-history-row.tsx
  - src/features/audit/service.ts
  - src/features/ingest/period-ingest-repo.ts
  - src/features/ingest/period-setup-repo.ts
  - src/features/ingest/period-setup.ts
  - src/features/ingest/repo.ts
  - src/features/schema/runtime.ts
  - src/features/versions/actions.ts
  - src/features/versions/period-commit.ts
  - src/features/versions/period-manage-plan.ts
  - src/features/versions/period-manage.ts
  - src/features/versions/period-sheet-change.ts
  - src/features/versions/service.ts
  - src/features/versions/types.ts
  - tests/e2e/period-manage.spec.ts
  - tests/features/versions/period-manage-plan.test.ts
  - tests/features/versions/period-manage.test.ts
  - tests/features/versions/service.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T16:41:47Z"
      findings: 3
    - "n": 2
      by: claude-code
      at: "2026-10-20T16:41:48Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 192556
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792514651465,"service":"data-dashboard","host":"127.0.0.1","port":45249,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792514651519,"service":"data-dashboard","host":"127.0.0.1","port":43693,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792514651622,"service":"data-dashboard","host":"127.0.0.1","port":34257,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792514651749,"service":"data-dashboard","host":"127.0.0.1","port":35175,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792514660628,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792514670045,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792514670068,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792514670071,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792514670085,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  189 passed | 1 skipped (190)
            Tests  2461 passed | 10 skipped (2471)
         Start at  16:42:47
         Duration  132.51s (tests 84%, import 13%, transform 3%)

          Isolate  190 workers spawned · ~155ms startup each (spawn + environment, per file)
                   at least ~9.66s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T16:45:01Z"
    tree: 4356172ed55014323ea9b372fb461a06676f7d305e978d44553766b0daef5110
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
    - 57df970
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
    - a5360dd
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
    - bcbddee
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
    total: 4
    done: 4
  audit:
    at: "2026-10-20T16:45:02Z"
    passed: true
    tree: 4356172ed55014323ea9b372fb461a06676f7d305e978d44553766b0daef5110
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 504 dirs visited, 3209 inodes visited, 1 Extract calls, 206.301898ms elapsed, 206.302025ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-24, Fase 3. Perkiraan 3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given dataset periode, then kartu Periode menampilkan Periode, Baris per sheet, File, Diunggah oleh, dan Tanggal, beserta aksi 'Unggah ulang' (periode terisi) dan 'Hapus'
- [x] Given 'Hapus Februari 2026' dikonfirmasi, then versi PERIOD_REMOVE aktif dalam hitungan detik tanpa job worker, periode lain tidak berubah, dan AuditLog tercatat; periode terakhir tidak bisa dihapus (diarahkan ke 'Ganti semua data')
- [x] Given periode diganti/dihapus dan versi lama yang memuatnya masih tersimpan, when 'Pulihkan', then versi PERIOD_RESTORE memuat segmen lama periode itu tanpa membatalkan periode lain; bila versi lama sudah terhapus retensi, aksi tidak tersedia dan ada penjelasannya
- [x] Given riwayat versi, then setiap baris menyebut perubahan periodenya (ditambahkan / diganti 12.400 → 12.950 / dilepas (batas 24 periode) / dihapus / dipulihkan), dan rollback memperingatkan periode yang ikut hilang

## Risk
- Impact: kartu Periode di halaman dataset (daftar + Unggah ulang/Hapus/Pulihkan), riwayat versi (kalimat
  hapus/pulihkan, peringatan rollback), panel unggah (periode terisi), migrasi aditif `Segment.uploadedById`.
  Hapus/pulihkan hanya menulis manifest versi baru (file typed lama dirujuk ulang, tanpa objek baru, tanpa
  job worker); data tidak pernah dihapus di tempat.
- Security (STRIDE): S/E — Server Action `requireUser` + kepemilikan dicek di query lock (`ownerId`), bukan
  pemilik → NOT_FOUND; T — payload zod strict (kunci periode regex, id cuid), versi asal harus READY milik
  dataset yang sama; R — AuditLog `dataset.period.remove`/`dataset.period.restore`; D — rate limit
  `versionChange`, lock Dataset dengan timeout transaksi (P2028 → DATASET_BUSY); I — tidak ada data baru ke
  klien selain metadata periode milik pemilik.
- Rollback: kode — revert commit; data — setiap hapus/pulihkan adalah versi biasa, jadi "Aktifkan" versi
  sebelumnya mengembalikan manifest lama; migrasi — `ALTER TABLE "Segment" DROP COLUMN "uploadedById"`.
- Validation: unit `period-manage-plan` 12, `period-manage` 11, `service` 19; e2e `period-manage` 1/1
  (worker dihentikan sebelum hapus/pulihkan), regresi `versions` 7/7, `mapping` 4/4, `period-review` 6/6,
  `period-upload-panel` 2/2, `period-limits` 2/2, `period-setup` 3/3; `aitk check` lulus.

## Notes
- Hapus = versi `PERIOD_REMOVE` READY dibuat + `writePeriodManifest` (diekstrak dari commit unggahan periode,
  dipakai bersama) + gerbang integritas + `activateVersionInTx` (sheetMap) dalam satu transaksi di bawah lock
  Dataset; versi aktif harus = yang dilihat halaman (PLAN_STALE), versi non-terminal → DATASET_BUSY, kunci
  di-HEAD sebelum lock (belum terbukti → coba lagi). Periode terakhir ditolak dengan arahan "Ganti semua data".
- Pulihkan = versi `PERIOD_RESTORE`: isi periode di setiap sheet aktif = isi di versi siap lama (segmen sama,
  file typed sama). Syarat: satuan sama, tanda tangan tipe kolom/sumber periode sama (tanpa cast ulang; bila
  berbeda aksi tidak tersedia + alasan), batas dihitung seperti unggahan dengan onLimit=REJECT (tidak pernah
  melepas periode lain). Isi dibandingkan per segmen (recast tidak dianggap perubahan).
- Kandidat "Pulihkan": periode di versi siap tersimpan (terbaru dulu) yang isinya berbeda/tidak ada di data
  aktif; periode yang menurut riwayat dihapus/diganti/dilepas tapi versinya sudah dibuang retensi → "tidak
  bisa dipulihkan" + penjelasan.
- Asumsi (keputusan standar): pemulihan tidak menahan GC tambahan (sesuai rencana §4.7); versi hapus/pulihkan
  berjudul "Hapus/Pulihkan periode <label>" di `originalName` (seperti "Atur periode"); daftar periode urut
  terbaru dulu.
- Review putaran 1 (0 blokir): L1 diperbaiki — dialog "Pulihkan" menyebut baris periode per sheet sebelum →
  sesudah, termasuk sheet yang kehilangan baris periode itu karena versi asal tidak memuatnya (uji unit +
  e2e); L2 diperbaiki — recast/koreksi skema yang antre/berjalan di sheet aktif (indeks
  `recast:inflight:s:<sheetId>`) → DATASET_BUSY sebelum transaksi, cek gagal = fail-closed (uji unit); L3
  dicatat di sini sesuai arahan reviewer (tanpa perubahan kode). Sisa celah L2: cek indeks Redis di luar lock
  DB, jadi recast yang diantre tepat setelah cek masih bisa basi (perilaku recast basi yang sudah ada).
- Plugin frontend-expert tidak tersedia di sesi cloud: UI mengikuti pola yang ada (token CSS, Tabler
  `size={20} stroke={1.5}`, tabel → kartu di < @3xl, CTA 44 px di ponsel), diuji axe (serious/critical = 0)
  di 1280 dan 360 px.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: Server Action (app) → service `period-manage` (lock Dataset) → Prisma; storage hanya HEAD. Tidak ada komponen baru yang menangani data sensitif.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi; aksi memakai `requireUser("action")` yang ada.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Diverifikasi: `asOwner` + query lock `WHERE id AND "ownerId"`; overview `findFirst({ownerId})`; versi asal harus milik dataset yang sama; bukan pemilik → NOT_FOUND (unit `period-manage.test.ts`).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Diverifikasi: zod strict (kunci periode regex, id cuid), tanpa SQL dari klien ($queryRaw berparameter); teks dirender React (ter-escape).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografi.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Diverifikasi: kegagalan → `{ok:false, code, message}` Bahasa Indonesia; galat tak terduga → pesan umum, detail hanya di log; log terstruktur (datasetId, versionId, period) tanpa rahasia.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Diverifikasi: hanya metadata periode (nama file, nama/email pengunggah) untuk pemilik dataset; `Segment.uploadedById` SetNull saat akun dihapus.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Diverifikasi: tanpa dependensi baru, tanpa panggilan jaringan baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Diverifikasi: lock Dataset + PLAN_STALE (versi aktif berubah) + DATASET_BUSY (versi non-terminal) + HEAD sebelum lock; periode terakhir ditolak; pulihkan tidak pernah melepas periode lain (batas REJECT); rate limit versionChange.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru; hanya merujuk ulang objek yang sudah ada.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Diverifikasi: Server Action dengan payload ter-validasi zod dan rate limit; tidak ada Route Handler baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa konfigurasi/env baru; `aitk audit` dan npm audit hijau.

- L3 (review putaran 1): backfill migrasi Segment.uploadedById mengisi pengunggah segmen hasil 'Atur periode' dengan pemilik yang menjalankan setup, bukan pengunggah asli; jalur kode setelah migrasi menyalin pengunggah sumber dengan benar. Hanya relevan bila selain pemilik bisa mengunggah.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T16:45:01Z (192556 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 337259e, 35f92f6, 3602b55, 36afc9f, 3b96186, 3bb3baa, 49f49a5, 4bd9881, 4e9a95e, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 57df970, 59ec9a3, 6123427, 62ec216, 686497c, 69b8953, 6a7cef1, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8570e80, 8f6ef33, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, a019f8f, a03481c, a0e1646, a5360dd, a687d4c, a8f9162, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, bcbddee, c15362c, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d4c2029, d557c9e, d602f56, da46e35, dfc2ebb, dff9b8c, e24e070, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-code: 0 findings
