---
id: T-060
title: (Opsional) Satu periode dari beberapa file sebagai satu kelompok
status: done
profile: strict
goal: G-6
tags:
  - upload
  - ingest
  - optional
depends_on:
  - T-054
  - T-059
created: "2026-10-15T02:30:59Z"
updated: "2026-10-20T21:00:23Z"
closed: "2026-10-20T21:00:23Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 2ed6480fa08a6e5006a4ece0d926a742c61432eb
paths:
  - .env.example
  - playwright.config.ts
  - prisma/migrations/20261021110000_t060_period_group/migration.sql
  - prisma/schema.prisma
  - src/components/datasets/upload-queue.tsx
  - src/features/ingest/period-capacity.ts
  - src/features/ingest/period-group.ts
  - src/features/ingest/period-ingest-repo.ts
  - src/features/ingest/period-ingest.ts
  - src/features/ingest/period-plan.ts
  - src/features/ingest/period-upload-plan.ts
  - src/features/ingest/recast.ts
  - src/features/ingest/repo.ts
  - src/features/query/grid-repo.ts
  - src/features/uploads/queue-actions.ts
  - src/features/uploads/queue-plan.ts
  - src/features/uploads/queue.ts
  - src/features/versions/integrity-check.ts
  - src/features/versions/integrity.ts
  - src/features/versions/period-commit.ts
  - src/features/versions/period-manage-plan.ts
  - src/features/versions/period-manage.ts
  - src/features/versions/period-upload.ts
  - src/features/versions/service.ts
  - src/lib/env.ts
  - tests/e2e/period-group.spec.ts
  - tests/features/ingest/period-group.test.ts
  - tests/features/ingest/period-ingest.test.ts
  - tests/features/ingest/period-upload-plan.test.ts
  - tests/features/uploads/queue-plan.test.ts
  - tests/features/uploads/queue.test.ts
  - tests/features/versions/integrity.test.ts
  - tests/features/versions/period-manage-plan.test.ts
  - tests/features/versions/service.test.ts
  - tests/lib/env.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T20:56:59Z"
      findings: 4
    - "n": 2
      by: claude-code
      at: "2026-10-20T20:57:00Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 174237
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792529950175,"service":"data-dashboard","host":"127.0.0.1","port":43589,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792529950227,"service":"data-dashboard","host":"127.0.0.1","port":43045,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792529950326,"service":"data-dashboard","host":"127.0.0.1","port":42349,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792529950435,"service":"data-dashboard","host":"127.0.0.1","port":39129,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792529960256,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792529968093,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792529968118,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792529968121,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792529968131,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  199 passed | 1 skipped (200)
            Tests  2632 passed | 10 skipped (2642)
         Start at  20:57:55
         Duration  118.90s (tests 83%, import 13%, transform 3%)

          Isolate  200 workers spawned · ~135ms startup each (spawn + environment, per file)
                   at least ~8.89s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T20:59:55Z"
    tree: cb6b311750a1b960e2a0662709b75c0c6b7ff4d4d1997b0477318ab7dc5ba0bd
  commits:
    - 08ca5b4
    - 0cb153a
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
    - 65e370c
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
    at: "2026-10-20T20:59:56Z"
    passed: true
    tree: cb6b311750a1b960e2a0662709b75c0c6b7ff4d4d1997b0477318ab7dc5ba0bd
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 514 dirs visited, 3698 inodes visited, 1 Extract calls, 201.326514ms elapsed, 201.326675ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-28, Fase 3. Perkiraan 3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

Tujuan (§4.6 P-28): satu periode yang dipecah ke beberapa file (mis. bulan > 1.048.576 baris xlsx)
diunggah sebagai SATU kelompok yang mengganti periode itu utuh dalam satu versi — tanpa heuristik
tumpang-tindih tanggal, tanpa aktivasi sebagian, ≤ PERIOD_MAX_FILES file. R21: otorisasi (T-016) tidak
berubah (owner-scope antrean); ekspor/Lihat data (T-017/T-058) membaca manifest apa adanya, jadi
beberapa segmen satu periode diurutkan (_period, ordinal) seperti segmen biasa.

## Acceptance criteria
- [x] Given bulan > 1.048.576 baris yang dipecah ke 3 file xlsx, when ketiganya diunggah sebagai satu kelompok untuk Maret 2026, then satu versi berisi 3 segmen Maret menggantikan seluruh Maret, dan mengunggah ulang kelompok yang sama menghasilkan data identik tanpa baris ganda
- [x] Given kelompok > PERIOD_MAX_FILES, then ditolak dengan pesan

## Risk
- Impact: invarian "satu segmen per periode per sheet" dilonggarkan HANYA untuk satu kelompok file lengkap
  (Segment.groupId/groupPart/groupSize, `segmentGroupProblem`) — rencana, manifest, gerbang integritas,
  recast, hapus/pulihkan, kartu Periode, meter kapasitas ikut. Antrean T-059 mendapat mode kelompok.
- Security (STRIDE): T — tidak ada append buta: >1 segmen per periode ditolak gerbang integritas kecuali
  satu kelompok lengkap; I/E — semua akses tetap owner-scope (NOT_FOUND), kunci objek diturunkan server
  (raw/<ds>/<groupVersionId>/part-<n>.<ext>); D — PERIOD_MAX_FILES (10) dicek sebelum antrean dibuat,
  kuota dipesan untuk total; R — AuditLog konfirmasi/rollback tidak berubah.
- Rollback: migrasi aditif `20261021110000_t060_period_group` (kolom nullable/default). Kode lama
  membaca versi kelompok sebagai "periode muncul lebih dari sekali" (gagal integritas, fail-closed) —
  jadi rollback kode hanya aman bila tidak ada segmen kelompok di manifest hidup (hapus/pulihkan dulu).
- Validation: unit (integrity, upload-plan, manage-plan, queue-plan, queue, period-ingest dengan
  DuckDB nyata, period-group, env), e2e `period-group` 1/1 + regresi period-queue/upload/review/
  manage/limits/mapping.

## Notes
- Keputusan (Q5 rencana: "bila jarang, tunda"): tidak ada data ukur frekuensi bulan > 1.048.576 baris di
  lingkungan ini; pemilik meminta semua task dituntaskan dan AC menuntut perilaku, jadi diimplementasikan.
- Desain: kelompok = antrean T-059 dengan `grouped` + `groupVersionId` (dipesan saat dibuat). Semua file
  diunggah dulu ke prefix versi kelompok; baru SATU versi PERIOD (groupFiles = daftar file) dibuat dan
  diproses worker sekaligus (parse per file → segmen per file per periode → satu rencana → satu commit).
  Rencana memperlakukan kelompok sebagai satu unggahan: periode di file mana pun diganti utuh oleh
  gabungan semua file. Sidik file = sha256 dari daftar sha (unggah ulang kelompok yang sama → "identik").
- Tidak pernah aktif sebagian: satu file gagal/dilewati sebelum lengkap → semua file dibatalkan; gagal
  saat giliran → semua gagal; file butuh pemetaan kolom / vonis cast < 98% → seluruh kelompok FAILED
  (pemetaan kelompok tidak didukung — asumsi: samakan judul kolom; kandidat task lanjutan bila perlu).
  groupFiles tidak terbaca → versi FAILED (bukan diproses file pertama saja).
- Batas: segmen per sheet (PERIOD_SHEET_MAX_SEGMENTS) menghitung setiap file kelompok. Deadline ingest
  60 menit berlaku untuk seluruh kelompok (10 file 1 GB bisa melewatinya → FAILED, data aktif tetap).
- AC1 dibuktikan dengan fixture kecil (3 file Maret: 2 CSV + 1 xlsx di unit; 3 CSV di e2e) — jalur
  identik dengan bulan > 1.048.576 baris; skala tidak diuji di sini (T-063).
- Sumber sel "Lihat data" untuk segmen kelompok memakai nama file bagian (Segment.originalName).
- Review putaran 1 (0 blokir): M1 file kelompok ber-sha256 sama (salinan) → kelompok ditolak dengan
  kedua nama file (regresi unit); L2 file kerja per bagian (sumber, salinan UTF-8, raw sheet diabaikan,
  raw + tabel periode setelah segmennya tertulis) dihapus; L3 sheet diabaikan disebut per file
  ("Ringkasan (maret-2.xlsx)"); L4 "identik" dinilai per periode dari sidik file yang memuat periode itu
  (IncomingSegmentRef.sha256), jatuh ke sidik unggahan bila tidak diketahui (regresi unit multi-periode).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan sama dengan T-059: browser → Server Action/Route Handler antrean (sesi, Origin, rate limit) → service `uploads/queue` (lock unggah pemilik + baris Dataset) → worker (versi kelompok) → Prisma/storage. Tidak ada data sensitif baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi; aksi memakai `requireUser("action")` yang ada.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Diverifikasi: antrean/file kelompok tetap di-scope `queue.dataset.ownerId`; versi kelompok dibuat server di dataset pemilik; bukan pemilik → NOT_FOUND (unit queue.test.ts yang ada).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Diverifikasi: flag `group` zod boolean; file divalidasi `validateInit` seperti antrean; `groupFilesProblem` (2..PERIOD_MAX_FILES, satu periode); `groupFiles` dibaca ulang fail-closed (`parseGroupFiles`); kunci objek diturunkan server; tanpa SQL dari klien.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografi (sha256 hanya sidik file).
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Diverifikasi: `{ok:false, code, message}` Bahasa Indonesia (LIMIT_REACHED/INVALID); galat kelompok di worker → pesan pemilik tanpa detail internal; log terstruktur (queueId, versionId, files).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Diverifikasi: hanya metadata file untuk pemilik; file kelompok yang batal/gagal dibuang; semua file kelompok di prefix versi → retensi 7 hari dan hapus dataset berlaku.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — Diverifikasi: tanpa dependensi baru dan tanpa panggilan jaringan baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Diverifikasi: tidak pernah aktif sebagian (satu file gagal/dilewati → semua batal; gagal giliran → semua gagal; butuh pemetaan → FAILED), satu versi per kelompok di bawah lock (promosi sekali — unit), >1 segmen per periode hanya kelompok lengkap (gerbang integritas), batas segmen menghitung setiap file, PERIOD_MAX_FILES ditegakkan server.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Diverifikasi: file kelompok melewati validasi unggah yang sama (ekstensi, ukuran, ListParts/HeadObject, signature); kunci raw/<ds>/<groupVersionId>/part-<n>.<ext> dari id server.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Diverifikasi: input aksi buat antrean divalidasi zod; rate limit unggah yang sama; route file antrean tidak berubah.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — Diverifikasi: env baru PERIOD_MAX_FILES (default 10, 2–36, divalidasi zod, di .env.example); npm audit hijau.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T20:59:55Z (174237 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 1781974, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 277b913, 27924c4, 27986dc, 29fe0f3, 2d7b316, 2d82efa, 2ed6480, 337259e, 35f92f6, 3602b55, 36afc9f, 3b96186, 3bb3baa, 4060d62, 4679db1, 49f49a5, 4bd9881, 4e9a95e, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 57df970, 59ec9a3, 6123427, 62ec216, 65e370c, 686497c, 69b8953, 6a7cef1, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8570e80, 8c08ba4, 8f6ef33, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, 9ced9f4, a019f8f, a03481c, a0e1646, a5360dd, a687d4c, a8f9162, acb27a6, ae4e5a2, af1994a, b0b99d8, b20b40b, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, bcbddee, c15362c, c1a5b7f, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d4c2029, d557c9e, d602f56, da46e35, dfc2ebb, dff9b8c, e24e070, e2f1df7, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 4 findings
- Review pass 2 by claude-code: 0 findings
