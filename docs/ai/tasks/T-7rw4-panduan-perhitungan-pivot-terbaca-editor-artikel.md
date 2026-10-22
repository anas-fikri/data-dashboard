---
id: T-7rw4
title: Panduan perhitungan pivot terbaca editor (artikel 16/17 untuk peran EDITOR + konteks Bantuan)
status: in_progress
profile: standard
created: "2026-10-21T21:52:15Z"
updated: "2026-10-22T00:08:43Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: bb7eb29b4cda6ea3494b7c07ba02ecac83709561
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 173188
    summary: |-
      …st":"127.0.0.1","port":35595,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792627680224,"service":"data-dashboard","host":"127.0.0.1","port":37155,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792627680331,"service":"data-dashboard","host":"127.0.0.1","port":37707,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792627680434,"service":"data-dashboard","host":"127.0.0.1","port":41591,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792627680862,"service":"data-dashboard","datasetId":"t072mvis8idnds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792627690959,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792627700535,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792627700556,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792627700559,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792627700567,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3025 passed | 10 skipped (3035)
         Start at  00:06:44
         Duration  117.13s (tests 82%, import 15%, transform 3%)

          Isolate  226 workers spawned · ~112ms startup each (spawn + environment, per file)
                   at least ~8.30s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T00:08:43Z"
    tree: 5ecb40e6f66cc680cf3d5ad4ca09d80fc9d2f17a9016565f7f7135b4619e8191
  audit:
    at: "2026-10-22T00:04:58Z"
    passed: true
    tree: 5ecb40e6f66cc680cf3d5ad4ca09d80fc9d2f17a9016565f7f7135b4619e8191
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 529 dirs visited, 5388 inodes visited, 1 Extract calls, 238.907486ms elapsed, 238.90771ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.3.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Editor dashboard yang tidak memiliki dataset (peran panduan EDITOR saja) bisa membaca panduan perhitungan
pivot (Tampilkan sebagai, field terhitung, N teratas) dan cara memakai pivot tersimpan: rujukan dari artikel
08 dan Bantuan mode edit tidak lagi 404/kosong. Pemilik mendapat artikel pivot tersimpan (17) di Bantuan
halaman pivot tersimpan dan halaman dataset. Viewer tetap tidak melihat artikel pemilik/editor.

## Acceptance criteria
- [x] Given editor tanpa dataset, when membuka rujukan panduan perhitungan pivot dari artikel 08 atau Bantuan mode edit, then artikel terbuka (bukan 404) dan artikel 17 ditawarkan Bantuan di halaman pivot tersimpan

## Risk
- Impact: isi panduan (2 artikel EDITOR baru, 16/17/08 diubah), enum GuideContext + nilai SAVED_PIVOT
  (migrasi aditif), GuideHelp menerima beberapa konteks (halaman dataset), tombol Bantuan di halaman pivot
  tersimpan. Tidak ada perubahan model akses (filter peran reader.ts tetap).
- Security (STRIDE): Information disclosure — artikel baru berperan EDITOR (viewer/pemilik-saja tetap 404,
  diuji e2e); GuideHelp tetap memakai `as` dari halaman server yang sudah menjaga akses. Lainnya N/A.
- Rollback: revert commit; artikel SAVED_PIVOT dikosongkan konteksnya (atau dump pra-upgrade) sebelum image
  lama jalan, karena Prisma client lama tidak mengenal nilai enum baru (catatan di migration.sql).
- Validation: vitest content.test (tautan /panduan/ sesuai peran, isi editor = isi pemilik, tanpa aksi
  pemilik), e2e guide-content (5/5), guide-roles (9/9), widgets saved-pivot-widgets (9/9).

## Notes
- Keputusan: format panduan satu peran per artikel (kolom `role` tunggal) → padanan EDITOR, bukan multi-peran
  (perubahan skema + editor admin + tab terlalu besar). `18-editor-perhitungan-pivot` = isi 16 apa adanya
  kecuali tautan pivot tersimpan (dijaga uji kesetaraan agar tidak menyimpang); `19-editor-pakai-pivot-tersimpan`
  hanya bagian yang bisa dilakukan editor (pilih sumber, baca-saja, Lepas dari sumber, siapa bisa apa).
- Konteks yang ada di kode hanya UPLOAD/SCHEMA/BUILDER dan halaman pivot tersimpan belum punya Bantuan →
  nilai enum baru SAVED_PIVOT ("Pivot tersimpan"); halaman dataset memakai UPLOAD + SAVED_PIVOT (judul panel
  "Bantuan: Dataset"). Artikel 17 tidak lagi di BUILDER mana pun (kontekstual tunggal); pemilik di penyusun
  tetap mendapat 16 yang menautkan 17.
- Produksi: seed `--update --only perhitungan-seperti-pivottable,satu-pivot-banyak-widget,editor-ubah-dashboard`
  (runbook-deploy.md) setelah upgrade yang menjalankan migrasi.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: hanya isi panduan + konteks Bantuan; batas tetap filter peran server di reader.ts dan `as` dari halaman server
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: sesi tidak berubah
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: artikel baru role EDITOR; viewer 404 untuk editor-perhitungan-pivot/editor-pakai-pivot-tersimpan dan editor 404 untuk satu-pivot-banyak-widget (e2e guide-content T-7rw4); halaman pivot tersimpan tetap 404 untuk non-pemilik (Bantuan as=OWNER di dalam halaman yang sudah dijaga); e2e guide-roles: artikel EDITOR berkonteks Pivot tersimpan tidak tampil di halaman pemilik
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: isi seed lewat guideInputSchema (zod, enum konteks bertambah SAVED_PIVOT); markdown tetap disanitasi; tautan relatif /panduan/… diizinkan guideUrl; konteks dari kode (bukan input user), Prisma `in` parameterized
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data sensitif/kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru; aitk audit hijau
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: hanya konten baca; take 5 per panel tetap
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada unggahan/berkas baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada endpoint baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: migrasi aditif (ADD VALUE enum); rollback dicatat di migration.sql dan Risk
