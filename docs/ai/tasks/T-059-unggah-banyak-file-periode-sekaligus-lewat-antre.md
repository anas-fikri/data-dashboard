---
id: T-059
title: Unggah banyak file periode sekaligus lewat antrean
status: done
profile: strict
goal: G-6
tags:
  - upload
  - ui
depends_on:
  - T-054
  - T-053
created: "2026-10-15T02:30:59Z"
updated: "2026-10-20T20:09:02Z"
closed: "2026-10-20T20:09:02Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: c1a5b7fd0ec95e61c59883d1d22a7de58d026439
paths:
  - playwright.config.ts
  - prisma/migrations/20261021100000_t059_upload_queue/migration.sql
  - prisma/schema.prisma
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/api/datasets/[id]/upload-queue/route.ts
  - src/app/api/upload-queue/items/[id]/complete/route.ts
  - src/app/api/upload-queue/items/[id]/parts/route.ts
  - src/app/api/upload-queue/items/[id]/route.ts
  - src/app/api/upload-queue/items/[id]/skip/route.ts
  - src/components/datasets/upload-panel.tsx
  - src/components/datasets/upload-period-picker.tsx
  - src/components/datasets/upload-queue-store.ts
  - src/components/datasets/upload-queue.tsx
  - src/features/admin/service.ts
  - src/features/uploads/queue-actions.ts
  - src/features/uploads/queue-plan.ts
  - src/features/uploads/queue.ts
  - src/features/uploads/quota.ts
  - src/features/uploads/service.ts
  - src/features/versions/actions.ts
  - src/features/versions/service.ts
  - src/worker/index.ts
  - tests/components/upload-queue-store.test.ts
  - tests/e2e/period-queue.spec.ts
  - tests/features/admin/fake-db.ts
  - tests/features/uploads/init-period.test.ts
  - tests/features/uploads/queue-actions.test.ts
  - tests/features/uploads/queue-migration.test.ts
  - tests/features/uploads/queue-plan.test.ts
  - tests/features/uploads/queue.test.ts
  - tests/features/uploads/quota.test.ts
  - tests/features/versions/service.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T20:05:20Z"
      findings: 5
    - "n": 2
      by: claude-code
      at: "2026-10-20T20:05:21Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 194349
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792526867944,"service":"data-dashboard","host":"127.0.0.1","port":46543,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792526867999,"service":"data-dashboard","host":"127.0.0.1","port":43873,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792526868102,"service":"data-dashboard","host":"127.0.0.1","port":41491,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792526868212,"service":"data-dashboard","host":"127.0.0.1","port":34247,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792526876273,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792526884067,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792526884090,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792526884092,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792526884104,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  198 passed | 1 skipped (199)
            Tests  2608 passed | 10 skipped (2618)
         Start at  20:06:20
         Duration  134.23s (tests 84%, import 13%, transform 3%)

          Isolate  199 workers spawned · ~152ms startup each (spawn + environment, per file)
                   at least ~9.93s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T20:08:36Z"
    tree: 695bdd0fbcbfee6427dedcf710a4c83513aa2b95a99c2175e2dd5cfa0e56fe09
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
    - 277b913
    - 27924c4
    - 27986dc
    - 29fe0f3
    - 2d7b316
    - 2d82efa
    - 337259e
    - 35f92f6
    - 3602b55
    - 36afc9f
    - 3b96186
    - 3bb3baa
    - 4060d62
    - 4679db1
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
    total: 2
    done: 2
  audit:
    at: "2026-10-20T20:08:37Z"
    passed: true
    tree: 695bdd0fbcbfee6427dedcf710a4c83513aa2b95a99c2175e2dd5cfa0e56fe09
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 513 dirs visited, 3599 inodes visited, 1 Extract calls, 250.276947ms elapsed, 250.277217ms wall time
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
Pemilik dataset per periode bisa memilih banyak file (mis. 12–24 bulan) sekaligus; file diantre di server
dan diproses satu per satu (hanya satu versi non-terminal per dataset, D4) dalam urutan deterministik,
dengan progres "File k dari n", file gagal tercatat tanpa menghentikan antrean, antrean berhenti saat
satu file menunggu tinjauan/pemetaan lalu lanjut sendiri setelah diputuskan, dan file yang sudah terunggah
tetap diproses walau tab ditutup (rencana §4.5 langkah 6).

Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-27, Fase 3. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given pemilik memilih 12 file bulanan, then file diantre dan diproses berurutan dengan progres 'File 3 dari 12'; satu file gagal tidak menghentikan antrean dan tercantum di ringkasan
- [x] Given satu file memicu tinjauan, then antrean berhenti menunggu keputusan lalu bisa dilanjutkan; menutup tab tidak menghilangkan file yang sudah terunggah

## Risk
- Impact: tabel baru `UploadQueue`/`UploadQueueItem` (aditif), refaktor `completeUpload`/`signParts` menjadi
  `completeTarget`/`signTarget` (dipakai unggahan biasa dan antrean), init unggah satu file ditolak
  `DATASET_BUSY` selama antrean dataset terbuka, kuota memesan byte file antrean yang belum menjadi
  versi, job pemeliharaan baru `upload-queues` (tiap menit), alih kepemilikan dataset menghentikan antrean.
- Security (STRIDE): Spoofing/Elevation — semua route/aksi `requireUser` + scope `dataset.ownerId`
  (lainnya NOT_FOUND); Tampering — urutan/label/kuota diputuskan server, kunci objek diturunkan server
  (`raw/<ds>/<versionId>/source.<ext>`), alasan "lewati" hanya kode tetap; Repudiation — log terstruktur
  (queueId, queueItemId, versionId); Info disclosure — status antrean hanya untuk pemilik; DoS — maks 36
  file, kuota dipesan untuk seluruh antrean, rate limit init/sign, file ditinggalkan > 24 jam gagal.
- Rollback: kode lama tidak membaca tabel baru; revert commit + `DROP TABLE "UploadQueueItem",
  "UploadQueue"; DROP TYPE "UploadQueueItemState", "UploadQueueStatus"` (antrean terbuka hilang; versi
  yang sudah dibuat tetap normal). Objek file antrean yang belum menjadi versi ada di prefix
  `raw/<ds>/<versionId>/` dan ikut terhapus saat dataset dihapus.
- Validation: unit `queue-plan` (15), `queue` (18), `queue-actions` (3), `upload-queue-store` (3),
  init/kuota; e2e `period-queue` 2/2 + regresi `uploads` 9/9, `period-upload` 4/4,
  `period-upload-panel` 2/2, `period-review` 6/6.

## Notes
- Desain: daftar file → antrean server (`createUploadQueue`, urutan periode dari label/nama file lalu nama,
  id versi dipesan per file). Browser mengunggah file satu per satu (multipart bisa dilanjutkan,
  `/api/upload-queue/items/<id>`), status unggah di modul klien sehingga tetap jalan saat pindah ke layar
  tinjauan. Giliran (`advanceUploadQueue`) di server di bawah lock unggah pemilik + baris Dataset:
  catat hasil versi file sebelumnya, buat versi PERIOD (`UPLOADED`, versi dasar = aktif saat giliran) untuk
  file berikutnya bila dataset bebas. Dipicu selesai unggah, akhir job ingest/pemetaan worker, Terapkan/
  Batalkan tinjauan, dan job pemeliharaan tiap menit (antrean berjalan tanpa tab).
- Asumsi (keputusan standar): file gagal (format/ingest/batas saat giliran) tidak menghentikan antrean
  (AC1); file yang menunggu tinjauan/pemetaan menahan antrean dan antrean lanjut sendiri setelah
  diputuskan (Terapkan atau Batalkan); "Hentikan antrean" membatalkan file yang belum diproses, file yang
  sedang ditinjau tetap diselesaikan; satu periode berlabel hanya satu file per antrean (kelompok = T-060);
  maks 36 file per antrean; ringkasan tampil sampai ditutup (≤ 7 hari).
- Tutup tab: file yang sudah terunggah tetap diproses server; file yang belum terunggah tampil "belum
  terunggah" dan bisa dipilih ulang (dicocokkan nama+ukuran+waktu ubah) atau dilewati; ditinggalkan > 24
  jam → gagal.
- Plugin frontend-expert tidak tersedia di sesi cloud ini: UI mengikuti pola komponen yang ada (token,
  Badge/ConfirmDialog/FormAlert, Tabler 20/1.5, target sentuh 44 px di ponsel) + axe tanpa pelanggaran
  serius di e2e; audit `/frontend-expert:audit` belum dijalankan.

- Review putaran 1 (0 blokir): M1 kedaluwarsa 24 jam diukur dari aktivitas unggah antrean (init/part/
  selesai menyentuh antrean); L2 indeks unik parsial dijaga uji migrasi + catatan di schema/migrasi; L3
  kuota memesan proyeksi (sumber + parquet) file antrean; L4 rate limit unggah di route selesai/lewati; L5
  versi dibuang di tinjauan/kedaluwarsa dicatat dibatalkan di transaksi yang sama, versi yang hilang
  tanpa catatan (retensi versi gagal) = gagal.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: browser → Route Handler unggah (Origin + sesi + rate limit) / Server Action → service `uploads/queue` (lock unggah pemilik + baris Dataset) → Prisma + storage (presigned PUT). Tidak ada data sensitif baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi; route/aksi memakai `requireUser("action")` yang ada.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Diverifikasi: setiap kueri file/antrean di-scope `queue.dataset.ownerId = user`; dataset dikunci `WHERE id AND "ownerId"`; bukan pemilik → NOT_FOUND (unit `queue.test.ts` "milik orang lain"); GET status mengembalikan null untuk non-pemilik.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Diverifikasi: zod + `validateInit` per file (nama dibersihkan, ekstensi, ukuran, lastModified, label ISO awal periode); urutan/kunci objek ditetapkan server; alasan lewati hanya kode dari daftar tetap; tanpa SQL dari klien ($queryRaw berparameter); teks dirender React.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografi.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Diverifikasi: `{ok:false, code, message}` Bahasa Indonesia; galat tak terduga → pesan umum (aksi) / STORAGE_ERROR (route), detail hanya di log terstruktur (queueId, queueItemId, versionId) tanpa rahasia.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Diverifikasi: hanya metadata file (nama, ukuran, waktu ubah, periode) untuk pemilik; objek file yang dibatalkan/gagal dibuang; antrean ikut terhapus bersama dataset (cascade + prefix raw/<ds>/).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi eksternal baru (presigned URL storage yang sama dengan unggahan biasa).
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Diverifikasi: tanpa dependensi baru, tanpa panggilan jaringan baru selain route unggah sendiri.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Diverifikasi: satu antrean OPEN per dataset (indeks unik parsial), giliran di bawah lock (tidak pernah dua versi non-terminal), transisi file bersyarat status (complete/lewati/promosi idempoten, tanpa promosi ganda — unit), kuota dipesan untuk total file, maks 36 file, unggah satu file ditolak selama antrean terbuka, file ditinggalkan > 24 jam gagal.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Diverifikasi: file antrean melewati validasi yang sama dengan unggahan biasa (ekstensi, ukuran ≤ MAX_UPLOAD_BYTES, ListParts + HeadObject, signature 64 KB); kunci objek dari id server (tanpa path dari klien).
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Diverifikasi: route baru memakai `uploadRoute` (Origin = APP_URL, JSON ≤ 8 KB, sesi, rate limit init/sign); aksi buat antrean memakai rate limit unggah; GET status no-store.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa env baru; `aitk audit` dan npm audit hijau.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T20:08:36Z (194349 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 277b913, 27924c4, 27986dc, 29fe0f3, 2d7b316, 2d82efa, 337259e, 35f92f6, 3602b55, 36afc9f, 3b96186, 3bb3baa, 4060d62, 4679db1, 49f49a5, 4bd9881, 4e9a95e, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 57df970, 59ec9a3, 6123427, 62ec216, 686497c, 69b8953, 6a7cef1, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8570e80, 8c08ba4, 8f6ef33, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, 9ced9f4, a019f8f, a03481c, a0e1646, a5360dd, a687d4c, a8f9162, acb27a6, ae4e5a2, af1994a, b0b99d8, b20b40b, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, bcbddee, c15362c, c1a5b7f, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d4c2029, d557c9e, d602f56, da46e35, dfc2ebb, dff9b8c, e24e070, e2f1df7, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-code: 0 findings
