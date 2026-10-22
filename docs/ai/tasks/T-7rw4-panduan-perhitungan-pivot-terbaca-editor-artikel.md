---
id: T-7rw4
title: Panduan perhitungan pivot terbaca editor (artikel 16/17 untuk peran EDITOR + konteks Bantuan)
status: done
profile: strict
created: "2026-10-21T21:52:15Z"
updated: "2026-10-22T00:13:26Z"
closed: "2026-10-22T00:13:26Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: bb7eb29b4cda6ea3494b7c07ba02ecac83709561
paths:
  - content/panduan/08-editor-ubah-dashboard.md
  - content/panduan/16-perhitungan-seperti-pivottable.md
  - content/panduan/17-satu-pivot-banyak-widget.md
  - content/panduan/18-editor-perhitungan-pivot.md
  - content/panduan/19-editor-pakai-pivot-tersimpan.md
  - docs/runbook-deploy.md
  - prisma/migrations/20261022000000_t7rw4_guide_context_saved_pivot/migration.sql
  - prisma/schema.prisma
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/(app)/datasets/[id]/pivot-tersimpan/[pivotId]/page.tsx
  - src/app/(app)/datasets/[id]/pivot-tersimpan/baru/page.tsx
  - src/components/guides/guide-help.tsx
  - src/components/guides/labels.ts
  - src/components/saved-pivots/saved-pivot-page.tsx
  - src/features/guides/reader.ts
  - src/features/guides/validation.ts
  - tests/e2e/guide-content.spec.ts
  - tests/e2e/guide-roles.spec.ts
  - tests/features/guides/content.test.ts
  - tests/features/guides/reader.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T00:10:12Z"
      findings: 3
    - "n": 2
      by: claude-code
      at: "2026-10-22T00:10:13Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 169309
    summary: |-
      …st":"127.0.0.1","port":43629,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792627941784,"service":"data-dashboard","host":"127.0.0.1","port":34703,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792627941883,"service":"data-dashboard","host":"127.0.0.1","port":46815,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792627941985,"service":"data-dashboard","host":"127.0.0.1","port":39713,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792627942363,"service":"data-dashboard","datasetId":"t072mvise46jds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792627953138,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792627963886,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792627963908,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792627963910,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792627963918,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3025 passed | 10 skipped (3035)
         Start at  00:11:07
         Duration  114.15s (tests 82%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~109ms startup each (spawn + environment, per file)
                   at least ~8.10s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T00:13:03Z"
    tree: 5ecb40e6f66cc680cf3d5ad4ca09d80fc9d2f17a9016565f7f7135b4619e8191
  commits:
    - 7f14236
    - bb7eb29
    - cff3c8d
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-22T00:13:03Z"
    passed: true
    tree: 5ecb40e6f66cc680cf3d5ad4ca09d80fc9d2f17a9016565f7f7135b4619e8191
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 529 dirs visited, 5437 inodes visited, 1 Extract calls, 238.403383ms elapsed, 238.40354ms wall time
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

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-22T00:13:03Z (169309 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 7f14236, bb7eb29, cff3c8d
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-code: 0 findings
