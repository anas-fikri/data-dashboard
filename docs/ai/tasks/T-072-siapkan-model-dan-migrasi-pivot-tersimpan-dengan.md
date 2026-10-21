---
id: T-072
title: Siapkan model dan migrasi pivot tersimpan dengan perlindungan hapus dan remap versi
status: in_progress
profile: strict
profile_pinned: true
goal: G-7
tags:
  - security
  - data-model
depends_on:
  - T-071
created: "2026-10-21T10:24:12Z"
updated: "2026-10-21T16:12:07Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: b5206c20c8288e6a26d89f2ad1e093d1bf55a80a
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 223792
    summary: |-
      …t":"127.0.0.1","port":34513,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792599082720,"service":"data-dashboard","host":"127.0.0.1","port":43807,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792599082835,"service":"data-dashboard","host":"127.0.0.1","port":36503,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792599082946,"service":"data-dashboard","host":"127.0.0.1","port":34679,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792599083498,"service":"data-dashboard","datasetId":"t072mvib7kbqds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792599093249,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792599106225,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792599106248,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792599106252,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792599106264,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  216 passed | 1 skipped (217)
            Tests  2934 passed | 10 skipped (2944)
         Start at  16:09:30
         Duration  155.34s (tests 83%, import 13%, transform 3%)

          Isolate  217 workers spawned · ~162ms startup each (spawn + environment, per file)
                   at least ~11.58s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T16:12:07Z"
    tree: 88bd2d6ac86e8f45d5c03ccb76fa3e7eab88948e0f6180c5fc0ca8b0ed63832c
  audit:
    at: "2026-10-21T16:07:53Z"
    passed: true
    tree: 88bd2d6ac86e8f45d5c03ccb76fa3e7eab88948e0f6180c5fc0ca8b0ed63832c
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 523 dirs visited, 4739 inodes visited, 1 Extract calls, 263.277397ms elapsed, 263.277935ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.2.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Model SavedPivot tingkat dataset (ADR-0009): spec pivot tervalidasi (skema zod sama dengan widget pivot), revisi, CRUD Server Action pemilik dataset, perlindungan hapus IN_USE, remap pada aktivasi/rollback versi, AuditLog. Rencana G-7 §4.2, §5.

## Acceptance criteria
- [x] Given migrasi Prisma baru, then tabel SavedPivot {id, datasetId (cascade), name, nameKey unik per dataset, spec, missingColumns, revision, createdById?, createdAt, updatedAt} dan Widget.savedPivotId opsional (FK NoAction) dibuat; prisma migrate deploy di DB berisi data 1.0.0 berhasil tanpa mengubah widget lama; rollback image prev + dump terdokumentasi di runbook
- [x] Given pemilik dataset, when membuat/mengubah/mengganti nama pivot tersimpan lewat Server Action, then spec divalidasi terhadap skema sheet aktif, revision naik tiap simpan (CAS: revisi basi → CONFLICT, tidak menimpa), maks 50 per dataset (LIMIT_REACHED), AuditLog savedPivot.create/update/delete tercatat; non-pemilik (editor/viewer/orang lain) → NOT_FOUND
- [x] Given pivot tersimpan dipakai 3 widget di 2 dashboard, when pemilik menghapusnya, then ditolak IN_USE dengan daftar dashboard; given tidak dipakai, then terhapus; given dataset dihapus, then dashboard, widget, dan pivot tersimpan terhapus dalam satu transaksi tanpa galat FK
- [x] Given versi baru diaktifkan atau rollback dengan kolom berganti nama/hilang, then spec pivot tersimpan dipetakan dalam transaksi aktivasi yang sama dengan remap widget (sheet + kolom, termasuk kolom di field terhitung dan Saring); kolom tak ketemu → MISSING_COLUMN + missingColumns; versi yang hanya dipratinjau (AWAITING_CONFIRM) tidak mengubahnya
- [ ] Given checklist ASVS (V4 akses, V5 validasi, V7 log) dan aitk audit, then hijau; review keamanan fokus IDOR (savedPivotId lintas dataset/pemilik) tanpa temuan Critical/High

## Risk
- Impact: skema DB (tabel baru `SavedPivot`, kolom `Widget.savedPivotId` + FK NO ACTION + indeks), aktivasi/rollback versi (`versions/activation.ts` kini juga memetakan pivot tersimpan di transaksi yang sama), hapus dataset (cascade tambahan). Belum ada UI/binding widget (T-073/T-074), jadi widget lama dan jalur query tidak berubah.
- Security (STRIDE): Spoofing — user dari sesi (`requireUser`), bukan dari klien. Tampering — hanya pemilik dataset menulis; tulis di bawah lock baris Dataset (FOR UPDATE + `ownerId`, tanpa TOCTOU); spec divalidasi zod strict + `widgetPlan` terhadap sheet versi aktif (identifier hanya posisi skema). Repudiation — AuditLog `savedPivot.create/update/delete` di transaksi perubahannya (aktor, IP, nama, revisi). Information disclosure — non-pemilik/viewer/dataset lain → NOT_FOUND (bukan 403); kepemilikan dicek sebelum validasi spec agar pesan kolom tidak jadi oracle; sheet dataset lain → NOT_FOUND; editor dashboard hanya baca (tanpa angka pemakaian). DoS — maks 50 per dataset, bentuk spec dibatasi skema pivot (≤ 4 baris, ≤ 8 nilai, rumus ≤ 32 node). Elevation — tidak ada jalur viewer ke definisi pivot tersimpan.
- Rollback: `deploy/upgrade.sh rollback` (image prev + dump pra-upgrade; `SavedPivot` ditambahkan ke `NEW_TABLES` agar pemeriksaan tabel lolos) atau ganti image saja selama belum ada widget terikat; langkah manual DROP di runbook §7 R dan header migrasi.
- Validation: uji integrasi PostgreSQL `tests/features/saved-pivots/service.db.test.ts` (9 uji: akses, CAS, batas, IN_USE, FK, remap aktivasi/rollback/retensi, hapus dataset), unit `activation.test.ts` (+3) dan `actions.test.ts` (3); migrasi diuji di PostgreSQL 14 dengan widget berbentuk 1.0.0 (hash kolom lama identik, `migrate diff` kosong).

## Notes
- Implementasi: `src/features/saved-pivots/service.ts` (list/get untuk pemilik+editor; create/update(+ganti nama)/delete pemilik), `actions.ts` (Server Action, tanpa UI), remap di `versions/activation.ts` (`persistWidgets` memetakan widget lalu pivot tersimpan, revisi naik pada tiap tulis remap). `checkConfig` di dashboards/service diekspor agar validasi spec sama persis dengan simpan widget pivot.
- Kode galat: `CONFLICT` (revisi basi, sesuai AC; rencana §4.2 menyebut pakai kode CAS dashboard bila ada — dashboard memakai `STALE` untuk tata letak, tetapi AC ini eksplisit `CONFLICT`), `STALE` (versi aktif berganti sejak validasi, sama dengan widget), `IN_USE` (+ `dashboards[]` urut nama). `IN_USE`/`CONFLICT` ditambahkan ke daftar kode di conventions.
- Untuk T-073: pengikatan widget harus menulis `Widget.savedPivotId` dengan pivot tersimpan ber-`datasetId` = dataset dashboard (dicek di transaksi lock dashboard). Hapus pivot tersimpan bersaing dengan pengikatan → FK NO ACTION menolak (P2003) dan service membalas `IN_USE`. `revision` siap dipakai di kunci cache (naik juga saat remap).
- Bukti migrasi PG14 (container `postgres:14-alpine`, 2026-10-21): rantai migrasi sampai t060 → isi widget pivot/kpi → migrasi T-072 → md5 kolom lama Widget sebelum = sesudah (`d3b407a6…`), semua `savedPivotId` NULL, `prisma migrate diff` kosong; `migrate deploy` kode lama (tanpa folder T-072) = "No pending migrations" (ganti image saja aman).
- Uji: `npm run check` hijau (216 file, 2934 uji, termasuk 9 uji integrasi PostgreSQL); e2e terarah `versions` 7/7 dan `mapping` 7/7 (aktivasi/rollback/pemetaan lewat UI). Catatan: `next dev` yang sudah berjalan sebelum `prisma generate` memegang Prisma Client lama (`tx.savedPivot` undefined → rollback UI "Terjadi kesalahan"); hentikan dev server setelah migrasi baru sebelum e2e.
- AC5: checklist ASVS terisi, `aitk audit` hijau; review keamanan (IDOR) menunggu reviewer orkestrator.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: Server Action → service (sesi server), DB; definisi pivot tersimpan hanya pemilik (tulis) dan editor dashboard dataset (baca); viewer tidak punya jalur (Risk STRIDE).
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; aksi memakai requireUser() yang ada.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — diverifikasi: setiap tulis mengunci Dataset dengan `ownerId` di transaksinya; editor/viewer/orang lain/dataset lain → NOT_FOUND (uji integrasi AC2: create/update/delete oleh 3 peran + sheet lintas dataset dua arah); baca hanya pemilik + editor (viewer → NOT_FOUND).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — diverifikasi: spec lewat pivotSpecSchema strict + widgetPlan terhadap skema sheet aktif (kolom tak ada/field asing `sql` → INVALID, diuji); nama lewat cleanName (karakter kontrol ditolak); id lewat isIdShape; SQL hanya Prisma/parameter ($queryRaw bertemplate).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — diverifikasi: galat dibalas kode + pesan Indonesia (P2002/P2003/P2028/konflik tx dipetakan, lainnya dilempar ke handler umum); AuditLog savedPivot.* dengan aktor/IP/nama/revisi (tanpa spec penuh); penolakan tulis dicatat logAccessDenied (dibatasi volume).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — diverifikasi: hanya createdById (SetNull saat akun dihapus); pivot tersimpan ikut terhapus bersama dataset (uji AC3).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada komunikasi eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — diverifikasi: tanpa dependency baru; aitk audit hijau.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — diverifikasi: maks 50 per dataset dihitung di bawah lock Dataset; CAS revisi (basi → CONFLICT tanpa menimpa); simpan setelah aktivasi → STALE; hapus vs pengikatan bersamaan dijaga FK NO ACTION → IN_USE.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak ada file/unggahan.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — diverifikasi: Server Action hanya meneruskan field yang dikenal (uji actions.test.ts); belum ada Route Handler baru (endpoint baca untuk UI menyusul T-074).
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak mengubah konfigurasi; migrasi aditif.
