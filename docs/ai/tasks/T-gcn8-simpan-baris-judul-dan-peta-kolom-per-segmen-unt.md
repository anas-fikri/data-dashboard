---
id: T-gcn8
title: Simpan baris judul dan peta kolom per segmen untuk unggahan periode
status: done
profile: strict
depends_on:
  - T-040
created: "2026-10-20T01:03:01Z"
updated: "2026-10-20T05:38:40Z"
closed: "2026-10-20T05:38:40Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 69b8953d5c8f45ac76bc60aa50a59d9a82f30388
paths:
  - prisma/migrations/20261020130000_tgcn8_segment_header_colmap/migration.sql
  - prisma/schema.prisma
  - src/features/ingest/ingest.ts
  - src/features/ingest/recast.ts
  - src/features/ingest/repo.ts
  - src/features/ingest/typed.ts
  - tests/features/ingest/recast-fakes.ts
  - tests/features/ingest/recast.test.ts
review:
  passes:
    - "n": 1
      by: claude-code
      at: "2026-10-20T05:31:16Z"
      findings: 0
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-20T05:35:33Z"
      findings: 3
    - "n": 3
      by: claude-code
      at: "2026-10-20T05:35:34Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 161727
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792474649079,"service":"data-dashboard","host":"127.0.0.1","port":40621,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792474649131,"service":"data-dashboard","host":"127.0.0.1","port":41403,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792474649238,"service":"data-dashboard","host":"127.0.0.1","port":46121,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792474649340,"service":"data-dashboard","host":"127.0.0.1","port":38185,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792474657733,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792474662989,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792474663014,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792474663017,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792474663027,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  162 passed | 1 skipped (163)
            Tests  2103 passed | 10 skipped (2113)
         Start at  05:36:17
         Duration  117.77s (tests 86%, import 11%, transform 3%)

          Isolate  163 workers spawned · ~133ms startup each (spawn + environment, per file)
                   at least ~7.07s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T05:38:16Z"
    tree: 936377ea69da418a10cb5dbd0c9d31c3bba2b39a6405464fa4c5035a3322f7f7
  commits:
    - 18b74cc
    - 23e5ae9
    - 4eea84c
    - 56e4d6d
    - "6123427"
    - 69b8953
    - 90e4e63
    - f54828c
  acceptance:
    total: 2
    done: 2
  audit:
    at: "2026-10-20T05:38:17Z"
    passed: true
    tree: 936377ea69da418a10cb5dbd0c9d31c3bba2b39a6405464fa4c5035a3322f7f7
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 832 packages
          End status: 309 dirs visited, 1654 inodes visited, 1 Extract calls, 179.011952ms elapsed, 179.012093ms wall time
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
Tindak lanjut review T-040 (L3/L4), sebelum unggahan periode (T-052). Baris judul yang berlaku disimpan per file typed (`SegmentTyped.headerRow`; null = `Segment.headerRow`, kini imutabel), sehingga memilih ulang baris judul di satu versi tidak mengubah versi lain yang berbagi segmen. Setiap segmen menyimpan peta kolom raw → posisi kanonik (`Segment.colMap`, kosong = identitas); recast memprofil dan meng-cast lewat peta itu, sehingga unggahan dengan urutan kolom berbeda tetap di-cast dari kolom raw yang benar.

## Acceptance criteria
- [x] Given dua versi berbagi satu segmen, when baris judul dipilih ulang di salah satu versi, then baris judul segmen versi lain tidak berubah dan recast-nya tetap memakai baris judul miliknya
- [x] Given unggahan periode dengan urutan kolom berbeda dari skema aktif, when recast per segmen berjalan, then setiap kolom di-cast dari kolom raw segmen yang benar lewat peta kolom per segmen yang tersimpan

## Risk
Impact: migrasi 2 kolom (Segment.colMap default kosong, SegmentTyped.headerRow nullable + isi dari sheet satu segmen yang merujuknya). Recast/pemetaan tidak lagi mengubah Segment.headerRow. Peta kolom baru dipakai recast; penulisnya (pemetaan periode T-055) belum ada — semua segmen sekarang identitas.
Security (STRIDE): Tampering — indeks peta dipakai di SQL hanya sebagai bilangan bulat > 0 (rawColumnOf), bukan string. Lainnya tidak berubah.
Rollback: revert commit; kolom baru boleh tetap (diabaikan kode lama); judul segmen lama mungkin sudah tidak sinkron hanya untuk file revisi baru.
Validation: unit recast 30/30 (2 baru: AC1 judul per file, AC2 peta kolom); e2e schema 7/7, versions 7/7, mapping 4/4, recast-segments 1/1.

## Notes
- Asumsi: `colMap` ditulis oleh pemetaan periode (T-055) saat segmen dibuat; recast ganti baris judul untuk sheet satu segmen ber-peta non-identitas memakai nama dari urutan raw (belum mungkin terjadi sekarang).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — recast tetap di worker; tanpa komponen/batas kepercayaan baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak ada endpoint/aksi baru; jalur recast tetap memeriksa kepemilikan seperti sebelumnya
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — indeks peta kolom masuk SQL hanya sebagai bilangan bulat > 0 (rawColumnOf), input recast tetap divalidasi parseRecastInput
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografis
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — tidak ada pesan/log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi atau panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — judul per file typed menghilangkan efek samping lintas versi; swap tetap optimistic per revisi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak menyentuh unggahan
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah; aitk audit hijau

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T05:38:16Z (161727 ms)
- Acceptance criteria: 2/2 satisfied
- Commits: 18b74cc, 23e5ae9, 4eea84c, 56e4d6d, 6123427, 69b8953, 90e4e63, f54828c
- Review pass 1 by claude-code: 0 findings
- Review pass 2 by claude-reviewer-subagent: 3 findings
- Review pass 3 by claude-code: 0 findings
