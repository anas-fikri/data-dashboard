---
id: T-056
title: 'Kelola daftar periode: unggah ulang, hapus, pulihkan, riwayat berlabel'
status: in_progress
profile: standard
goal: G-6
tags:
  - ui
  - data-safety
  - security
depends_on:
  - T-054
created: "2026-10-15T02:30:58Z"
updated: "2026-10-20T16:22:33Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 57df97085e3c2c28ae8e0de45b17bd7dbf025a81
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 196190
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792513297928,"service":"data-dashboard","host":"127.0.0.1","port":33461,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792513297983,"service":"data-dashboard","host":"127.0.0.1","port":46145,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792513298090,"service":"data-dashboard","host":"127.0.0.1","port":33657,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792513298208,"service":"data-dashboard","host":"127.0.0.1","port":44021,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792513304938,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792513316671,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792513316692,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792513316697,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792513316707,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  189 passed | 1 skipped (190)
            Tests  2459 passed | 10 skipped (2469)
         Start at  16:20:14
         Duration  137.37s (tests 84%, import 13%, transform 3%)

          Isolate  190 workers spawned · ~157ms startup each (spawn + environment, per file)
                   at least ~9.78s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T16:22:33Z"
    tree: f10dfccbd3c767fea16fd35a0e1daa48e1032ee872e1cdce26323fe00e8cbeaf
  audit:
    at: "2026-10-20T16:18:42Z"
    passed: true
    tree: f10dfccbd3c767fea16fd35a0e1daa48e1032ee872e1cdce26323fe00e8cbeaf
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 503 dirs visited, 3131 inodes visited, 1 Extract calls, 213.893812ms elapsed, 213.893997ms wall time
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
- Validation: unit `period-manage-plan` 11, `period-manage` 10, `service` 19; e2e `period-manage` 1/1
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
