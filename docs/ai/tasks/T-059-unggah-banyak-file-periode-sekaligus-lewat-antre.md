---
id: T-059
title: Unggah banyak file periode sekaligus lewat antrean
status: in_progress
profile: standard
goal: G-6
tags:
  - upload
  - ui
depends_on:
  - T-054
  - T-053
created: "2026-10-15T02:30:59Z"
updated: "2026-10-20T19:50:27Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: c1a5b7fd0ec95e61c59883d1d22a7de58d026439
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 188284
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792525781513,"service":"data-dashboard","host":"127.0.0.1","port":43649,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792525781583,"service":"data-dashboard","host":"127.0.0.1","port":35435,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792525781682,"service":"data-dashboard","host":"127.0.0.1","port":46629,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792525781798,"service":"data-dashboard","host":"127.0.0.1","port":45659,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792525789560,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792525801583,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792525801606,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792525801608,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792525801617,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  197 passed | 1 skipped (198)
            Tests  2603 passed | 10 skipped (2613)
         Start at  19:48:18
         Duration  127.23s (tests 84%, import 13%, transform 3%)

          Isolate  198 workers spawned · ~146ms startup each (spawn + environment, per file)
                   at least ~9.47s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T19:50:27Z"
    tree: e27d3b58c91fb6ac8e694b35975a5a9abf85c2ef787d6eac4e82f13a8e21038b
  audit:
    at: "2026-10-20T19:46:45Z"
    passed: true
    tree: e27d3b58c91fb6ac8e694b35975a5a9abf85c2ef787d6eac4e82f13a8e21038b
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 513 dirs visited, 3494 inodes visited, 1 Extract calls, 237.564498ms elapsed, 237.564736ms wall time
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
