---
id: T-gcn8
title: Simpan baris judul dan peta kolom per segmen untuk unggahan periode
status: in_progress
profile: standard
depends_on:
  - T-040
created: "2026-10-20T01:03:01Z"
updated: "2026-10-20T05:31:04Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 69b8953d5c8f45ac76bc60aa50a59d9a82f30388
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 166972
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792474215483,"service":"data-dashboard","host":"127.0.0.1","port":38715,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792474215535,"service":"data-dashboard","host":"127.0.0.1","port":40225,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792474215634,"service":"data-dashboard","host":"127.0.0.1","port":42159,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792474215744,"service":"data-dashboard","host":"127.0.0.1","port":32839,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792474229180,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792474229206,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792474229209,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792474229220,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792474238313,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  162 passed | 1 skipped (163)
            Tests  2103 passed | 10 skipped (2113)
         Start at  05:29:00
         Duration  122.04s (tests 86%, import 12%, transform 3%)

          Isolate  163 workers spawned · ~146ms startup each (spawn + environment, per file)
                   at least ~7.78s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T05:31:04Z"
    tree: 936377ea69da418a10cb5dbd0c9d31c3bba2b39a6405464fa4c5035a3322f7f7
---

## Objective
Tindak lanjut review T-040 (L3/L4), sebelum unggahan periode (T-052). Baris judul yang berlaku disimpan per file typed (`SegmentTyped.headerRow`; null = `Segment.headerRow`, kini imutabel), sehingga memilih ulang baris judul di satu versi tidak mengubah versi lain yang berbagi segmen. Setiap segmen menyimpan peta kolom raw → posisi kanonik (`Segment.colMap`, kosong = identitas); recast memprofil dan meng-cast lewat peta itu, sehingga unggahan dengan urutan kolom berbeda tetap di-cast dari kolom raw yang benar.

## Acceptance criteria
- [ ] Given dua versi berbagi satu segmen, when baris judul dipilih ulang di salah satu versi, then baris judul segmen versi lain tidak berubah dan recast-nya tetap memakai baris judul miliknya
- [ ] Given unggahan periode dengan urutan kolom berbeda dari skema aktif, when recast per segmen berjalan, then setiap kolom di-cast dari kolom raw segmen yang benar lewat peta kolom per segmen yang tersimpan

## Risk
Impact: migrasi 2 kolom (Segment.colMap default kosong, SegmentTyped.headerRow nullable + isi dari sheet satu segmen yang merujuknya). Recast/pemetaan tidak lagi mengubah Segment.headerRow. Peta kolom baru dipakai recast; penulisnya (pemetaan periode T-055) belum ada — semua segmen sekarang identitas.
Security (STRIDE): Tampering — indeks peta dipakai di SQL hanya sebagai bilangan bulat > 0 (rawColumnOf), bukan string. Lainnya tidak berubah.
Rollback: revert commit; kolom baru boleh tetap (diabaikan kode lama); judul segmen lama mungkin sudah tidak sinkron hanya untuk file revisi baru.
Validation: unit recast 30/30 (2 baru: AC1 judul per file, AC2 peta kolom); e2e schema 7/7, versions 7/7, mapping 4/4, recast-segments 1/1.

## Notes
- Asumsi: `colMap` ditulis oleh pemetaan periode (T-055) saat segmen dibuat; recast ganti baris judul untuk sheet satu segmen ber-peta non-identitas memakai nama dari urutan raw (belum mungkin terjadi sekarang).
