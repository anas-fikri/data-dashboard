---
id: T-057
title: Terapkan pemetaan kolom (T-014) pada unggahan periode
status: in_progress
profile: standard
goal: G-6
tags:
  - ingest
  - schema
  - ui
depends_on:
  - T-052
created: "2026-10-15T02:30:58Z"
updated: "2026-10-20T17:32:23Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: e2f1df7f89b379142db93945f1e3751e0d4a63d5
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 183816
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792517494155,"service":"data-dashboard","host":"127.0.0.1","port":40791,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792517494215,"service":"data-dashboard","host":"127.0.0.1","port":33927,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792517494314,"service":"data-dashboard","host":"127.0.0.1","port":34089,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792517494420,"service":"data-dashboard","host":"127.0.0.1","port":44695,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792517502906,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792517516297,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792517516319,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792517516324,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792517516333,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  189 passed | 1 skipped (190)
            Tests  2482 passed | 10 skipped (2492)
         Start at  17:30:15
         Duration  126.18s (tests 84%, import 13%, transform 3%)

          Isolate  190 workers spawned · ~145ms startup each (spawn + environment, per file)
                   at least ~9.03s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T17:32:23Z"
    tree: 67c26793a6d74422d37746f7cabdb90d5b7f3577d8b243731c8d37053fb7709a
  audit:
    at: "2026-10-20T17:28:32Z"
    passed: true
    tree: 67c26793a6d74422d37746f7cabdb90d5b7f3577d8b243731c8d37053fb7709a
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 505 dirs visited, 3228 inodes visited, 1 Extract calls, 208.403949ms elapsed, 208.404391ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-25, Fase 3 (§4.9). Unggahan
periode yang judul kolomnya berbeda dari skema aktif berhenti di AWAITING_MAPPING (T-052) dan kini bisa
dipetakan lewat halaman Pemetaan kolom: pemetaan diterapkan HANYA pada segmen baru (raw tersimpan dari
ingest → jalur periode yang sama: periode per baris, batas, vonis cast, segmen per periode, commit di bawah
lock), periode lama tidak di-cast/ditulis ulang. "Kosongkan" = NULL hanya untuk periode baru (kolom tetap,
bukan absent); kolom tambahan menjadi kolom tersembunyi baru (posisi kanonik baru, judul tersimpan,
periode lama NULL lewat proyeksi); ubah tipe tidak ditawarkan (arahan ke halaman Skema); judul pengganti
yang dikonfirmasi diingat sebagai alias kolom sehingga bulan berikutnya terpetakan otomatis. Menutup
catatan review T-049 M1 (job pemetaan menulis typed tanpa `_period`): versi periode tidak lagi lewat
jalur pemetaan REPLACE. Cek ulang T-016 (otorisasi: tetap pemilik saja, NOT_FOUND) dan T-017 (ekspor
membaca manifest versi aktif + proyeksi kolom yang tidak ada di file lama).

## Acceptance criteria
- [x] Given file periode dengan 'Tgl Kirim' sementara kolom aktif bernama 'Tanggal Kirim', then hasilnya AWAITING_MAPPING; setelah dipetakan, hanya segmen baru yang di-cast dan periode lama tidak berubah
- [x] Given 'Kosongkan', then nilainya NULL hanya untuk periode baru dan kolom tidak menjadi absent; kolom tambahan menjadi kolom tersembunyi baru dengan judul tersimpan, dan periode lama bernilai NULL tanpa cast ulang
- [x] Given layar pemetaan pada dataset periode, then ubah tipe tidak ditawarkan dan ada arahan ke halaman Skema
- [x] Given bulan berikutnya kembali memakai 'Tgl Kirim', then kolom terpetakan otomatis lewat alias tersimpan tanpa AWAITING_MAPPING

## Risk
- Impact: worker pemetaan (`applyMapping` → `runPeriodMapping` untuk versi PERIOD), ingest periode
  (kolom tambahan kini kolom tersembunyi baru, juga tanpa pemetaan; alias dicocokkan), commit periode
  (perubahan skema sheet diterapkan pada salinan sheet aktif, revisi skema tetap), `planColumns` (alias),
  proyeksi query (`sheetSource`/`withSegments`: file tanpa kolom skema → NULL), recast (alias dibawa,
  sheet satu segmen yang lebih sempit), app pemetaan (validasi periode, tampilan, UI tanpa pilihan tipe).
  Migrasi aditif `20261021090000_t057_period_mapping` (DatasetVersion.periodMeta JSONB). Versi REPLACE
  tidak berubah perilaku (kecuali alias yang hanya ditulis T-057).
- Security (STRIDE): Spoofing/Elevation — Server Action simpan pemetaan tetap requireUser + lock Dataset
  milik user (bukan pemilik → NOT_FOUND); job hanya membawa versionId + keputusan. Tampering — keputusan
  divalidasi ulang di app (di bawah lock) dan worker (`validatePeriodMapping`: zod strict, posisi bilangan
  bulat, sheet dari lineage, tanpa `casts`, kolom periode tidak bisa dikosongkan); `periodMeta` ditulis
  worker dan diurai zod saat commit (bentuk asing → stale, tidak ditebak); posisi kolom masuk SQL hanya
  sebagai bilangan bulat dari skema. Repudiation — AuditLog `dataset.version.map` (pelaku, ip, id job,
  jumlah dipetakan/dikosongkan/kolom baru). Information disclosure — kolom baru tersembunyi (tidak bisa
  dipakai query/viewer sampai pemilik menampilkannya). DoS — satu job per versi (lock map:<id>), deadline
  60 menit, batas periode tetap ditegakkan sebelum typing.
- Rollback: aplikasi — revert commit (versi PERIOD yang sudah READY tetap terbaca: skema berisi kolom
  biasa + field `aliases` yang diabaikan kode lama; file typed lama tanpa kolom baru diproyeksikan NULL —
  kode lama dengan satu kelompok skema bisa galat "kolom tidak ada" hanya untuk kolom baru tersembunyi);
  data — aktifkan versi sebelumnya dari Riwayat versi. Skema — `ALTER TABLE "DatasetVersion" DROP COLUMN
  "periodMeta";` setelah tidak ada versi periode belum terminal.
- Validation: unit (DuckDB sungguhan) period-ingest +7 (AC1–AC4, review cast + persetujuan, tolak batas
  → bersih), period-upload-plan +3, period-commit +4, versions/mapping +4, ingest/mapping +1, refresh +1,
  source +1, recast +1, mapping-model +1; e2e `period-mapping` 3/3 (worker + halaman pemetaan sungguhan);
  regresi e2e terarah; `aitk check`.

## Notes

- Dari review T-049 (M1): job pemetaan (src/features/ingest/mapping.ts:240-253) menulis typed tanpa period dan typedFileProblems tidak memeriksa _period — WAJIB ditangani di task ini (versi periode AWAITING_MAPPING).
- Ditangani (T-049 M1): versi PERIOD tidak pernah lewat jalur pemetaan REPLACE (writeTyped tanpa `_period`);
  `applyMapping` mengarahkannya ke `runPeriodMapping`, yang menulis segmen lewat `processPeriodItems` (sama
  dengan ingest: `copyTyped` dengan `_period` + `typedFileProblems(..., period)` + cek tanggal ∈ periode).
- Keputusan standar (asumsi aman, bisa diubah pemilik):
  - Kolom tambahan menjadi kolom tersembunyi baru bertipe Teks (tanpa inferensi, D4; tidak ada nilai yang
    hilang), juga pada unggahan periode tanpa pemetaan (T-052 sebelumnya menyimpannya di raw saja).
    Pemilik menampilkan/mengubah tipenya di halaman Skema (recast per segmen; periode lama tidak ditulis
    ulang karena file lamanya tidak memuat kolom itu). Statistik kolom baru dihitung dari file itu saja.
  - Revisi skema tidak naik karena kolom baru/alias: perubahan skema (`periodMeta.changes`) diterapkan
    pada salinan sheet aktif saat commit dan hanya bila revisinya sama (`applySchemaChange`, selain itu
    stale). Kolom absent (T-014) dinormalkan menjadi kolom biasa bila lebar kanonik bertambah (posisi
    absent selalu tepat setelah Sheet.colCount); bila kolom itu tidak ada di unggahan berikutnya, ia
    muncul sebagai kolom hilang (keputusan pemetaan) — semantik periode: kosong hanya untuk periode itu.
  - Kolom absent yang kembali ada di file periode dipetakan langsung (nilai periode itu dari file,
    periode lama tetap NULL) — sebelumnya AWAITING_MAPPING.
  - Alias dicocokkan hanya bila pasti (satu kolom aktif pemilik alias, satu kolom file berjudul itu);
    judul asli selalu didahulukan. Alias ikut recast (kecuali ganti baris judul).
  - Vonis cast < 98 % saat pemetaan → tahap tinjau ("review"), simpan dengan persetujuan = nilai yang tidak
    cocok NULL hanya di segmen baru; ubah tipe lewat halaman Skema (versi menunggu menjadi basi → muat
    ulang, job memakai skema terbaru).
  - Hasil pemetaan mengikuti aturan aktif otomatis yang sama dengan ingest: murni menambah → aktif;
    selain itu AWAITING_CONFIRM (tinjauan periode T-054, pemberitahuan "Tinjau periode … lalu terapkan").
  - Raw saja dari ingest (segmen tanpa periode) dihapus setelah commit; segmen percobaan pemetaan yang
    gagal/ditolak dihapus selama versi masih AWAITING_MAPPING (lock baris versi), tidak saat commit tak pasti.
  - Proyeksi query: satu file/satu kelompok yang tidak memuat semua kolom skema kini juga lewat proyeksi
    NULL (mis. periode baru dihapus T-056 sehingga tinggal file lama). Proyeksi belum membawa `_period`
    (catatan T-058 tetap berlaku).
  - Perbaikan kecil: kunci baris tabel sampel Skema (nomor baris fisik bisa sama antar-unggahan → kunci
    React ganda).

- Bukti AC (2026-10-20):
  - AC1: unit period-ingest "T-057 AC1 … 'Tgl Kirim' vs 'Tanggal Kirim'" (AWAITING_MAPPING tanpa typed;
    setelah dipetakan April aktif, Jan–Mar typedId sama, objek baru hanya raw+typed April, raw saja dari
    ingest dibersihkan, nilai tanggal dari kolom 'Tgl Kirim'); e2e `period-mapping` AC1 (worker + halaman
    pemetaan sungguhan; typedId Jan–Mar sama, KPI 280/7).
  - AC2: unit "T-057 AC2 'Kosongkan' …" (colMap [1,2,0,3], nilai NULL hanya di April, kolom bukan absent,
    kolom tambahan pos 4 tersembunyi Teks + judul tersimpan, periode lama tanpa objek baru) + "kolom
    tambahan tanpa kolom yang hilang"; source.test proyeksi NULL; e2e AC1 (catatan ditampilkan dari Skema →
    hitungan 2 = hanya April, file typed Jan–Mar tidak ditulis ulang) + e2e AC2 Juni ("Kosongkan" →
    jumlah/hitungan nilai tetap 285/8, kode 10, kolom nilai bukan absent).
  - AC3: e2e AC1 (kartu "Data per periode" + tautan ke /skema, tanpa kontrol tipe); unit
    mapping-model "T-057 unggahan periode" (tanpa pemicu Ubah tipe), versions/mapping + period-ingest
    (casts → INVALID dengan arahan ke halaman Skema).
  - AC4: unit "AC4: bulan berikutnya memakai 'Tgl Kirim' lagi" + refresh "alias tersimpan" + recast
    "alias ikut ke revisi berikutnya"; e2e AC4 Mei langsung READY (setelah recast tampilkan kolom).
  - Regresi e2e terarah: mapping 7/7, period-upload 4/4, period-review 6/6, period-manage 1/1,
    recast-segments 1/1, schema 7/7, period-mapping 3/3; `aitk check` lulus (unit 2482).
- `aitk impact`: period-ingest-repo.ts (repo Prisma pemetaan), worker/index.ts, mapping-form.tsx,
  migrasi, playwright.config.ts dicakup e2e `period-mapping` (worker + DB + halaman sungguhan).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified: batas kepercayaan sama dengan T-014 — Server Action simpan (isian klien) → app (zod + lock Dataset milik user + validatePeriodMapping) → job (versionId + keputusan) → worker (validasi ulang terhadap skema aktif terkini, rencana periode dihitung ulang di bawah lock); periodMeta hanya ditulis worker
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak ada kredensial/endpoint auth baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified: submitMapping/mappingView/mappingStatus tetap pemilik saja (lock Dataset `ownerId`, bukan pemilik → NOT_FOUND); pasangan sheet periode dari lineage versi itu (sheet lain → INVALID); unit versions/mapping T-057
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified: keputusan zod strict (posisi bilangan bulat 1..MAX_COLUMN), validatePeriodMapping di app + worker (kolom hilang tepat sekali, kolom file dipakai sekali, tanpa casts, kolom periode tidak bisa dikosongkan); periodMeta diurai zod (bentuk asing → stale); posisi masuk SQL hanya bilangan bulat dari skema; alias hanya dicocokkan (normName), tidak masuk SQL
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data kriptografis
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified: pesan Bahasa Indonesia yang bisa ditindak (kolom periode tidak bisa dikosongkan, arahan ke Skema, batas); galat tak terduga → pesan umum; AuditLog dataset.version.map tanpa isi data (jumlah + id job)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified: kolom tambahan disimpan tersembunyi (tidak terlihat viewer/query sampai pemilik menampilkannya); raw saja dari ingest dihapus setelah commit; tidak ada nilai data di log/audit
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified: tanpa dependensi baru; tanpa panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified: satu job per versi (lock map:<id>), percobaan ulang mulai bersih hanya selama AWAITING_MAPPING (lock baris versi), commit tak pasti tidak menghapus objek, job yang sama dikenali lewat AuditLog (READY/AWAITING_CONFIRM); rencana + batas dihitung ulang di bawah lock; perubahan skema hanya diterapkan pada revisi yang sama (selain itu stale)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — verified: tidak ada unggahan baru — raw tersimpan dibaca dari kunci DB; kunci segmen baru dibuat server (seg/<cuid>/)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified: Server Action simpan pemetaan yang sama (zod + rate limit versionChange + DATASET_BUSY per user); status job lewat route yang sama
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — verified: migrasi aditif (periodMeta nullable); tanpa konfigurasi/env baru; aitk audit hijau
