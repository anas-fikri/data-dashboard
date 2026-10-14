---
id: T-013
title: 'Versi dataset: ganti data, aktivasi, rollback, retensi'
status: in_review
profile: strict
profile_pinned: true
goal: G-5
tags:
  - security
depends_on:
  - T-008
  - T-011
created: "2026-10-11T14:45:09Z"
updated: "2026-10-14T16:37:12Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 3a7b69d955891663b7e7b95b8db03c2b138b806a
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-14T07:09:12Z"
      findings: 5
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-14T07:32:12Z"
      findings: 6
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-14T08:07:20Z"
      findings: 5
    - "n": 4
      by: frontend-expert-design-reviewer
      at: "2026-10-14T08:45:44Z"
      findings: 6
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-14T09:25:26Z"
      findings: 9
    - "n": 6
      by: frontend-expert-design-reviewer
      at: "2026-10-14T10:27:13Z"
      findings: 4
    - "n": 7
      by: claude-verify-workflow
      at: "2026-10-14T11:47:07Z"
      findings: 3
    - "n": 8
      by: frontend-expert-design-reviewer
      at: "2026-10-14T12:59:11Z"
      findings: 1
    - "n": 9
      by: claude-verify-workflow
      at: "2026-10-14T13:35:09Z"
      findings: 5
    - "n": 10
      by: frontend-expert-design-reviewer
      at: "2026-10-14T14:27:12Z"
      findings: 4
    - "n": 11
      by: claude-verify-workflow
      at: "2026-10-14T15:24:53Z"
      findings: 6
    - "n": 12
      by: frontend-expert-design-reviewer
      at: "2026-10-14T16:00:24Z"
      findings: 2
    - "n": 13
      by: claude-verify-workflow
      at: "2026-10-14T16:31:35Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 34747
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1791995810305,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1791995810332,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  60 passed (60)
            Tests  888 passed (888)
         Start at  23:36:46
         Duration  24.42s (tests 84%, import 9%, transform 6%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-14T16:37:12Z"
    tree: 6758250cb55843dedd7224fb42e66adce6b7d99589d09f6dada87c45af3084b5
  audit:
    at: "2026-10-14T16:34:59Z"
    passed: true
    tree: df1dc6a0c745dc6d67ad608a7ddf474339f6d7b0ae166e6732e25bab7a8c50bc
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 723 packages
          End status: 141 dirs visited, 678 inodes visited, 1 Extract calls, 62.639583ms elapsed, 62.639ms wall time
          Loaded npm local db from /Users/anasfikri/Library/Caches/osv-scalibr/npm/all.zip

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
Mode REPLACE. Ingest versi refresh men-cast raw dengan skema aktif per nama asli tanpa inferensi (D4); cocok → READY + aktif. Rollback: pemilik mengaktifkan salah satu dari 2 versi READY sebelumnya. Retensi 3 versi READY; job pembersihan menghapus metadata + Parquet versi lebih lama dan file asli > 7 hari sejak ingestFinishedAt. Jalur AWAITING_MAPPING di T-014.

## Acceptance criteria
- [x] Given file baru dengan kolom sama (nama asli cocok setelah normalisasi spasi/kapital), when ingest REPLACE selesai, then versi baru aktif dan semua widget menampilkan data baru tanpa konfigurasi ulang; tipe yang dipaksa user di skema aktif tetap berlaku
- [x] Given ingest versi baru gagal, when user membuka dashboard, then data versi aktif lama tampil dan badge gagal terlihat di profil
- [x] Given 3 versi READY, when versi ke-4 READY, then versi tertua dihapus beserta Parquet-nya; when pemilik memilih rollback ke versi sebelumnya, then activeVersionId berpindah dan cache miss
- [x] Given file asli berumur > 7 hari sejak ingestFinishedAt (sukses atau gagal), when job pembersihan berjalan, then file asli terhapus dan dashboard tetap berfungsi
- [x] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- Impact: jalur ingest (finish tidak lagi selalu mengaktifkan), aktivasi versi (spec widget disimpan ulang),
  penghapusan data (retensi versi, file asli 7 hari, StorageCleanup), halaman profil dataset, panel unggah,
  worker maintenance. Salah hapus = kehilangan data pengguna; salah aktivasi = dashboard menampilkan versi keliru.
- Security (STRIDE): Spoofing/Elevation — aktivasi/rollback/buang versi hanya pemilik (Dataset.ownerId saat ini),
  non-pemilik NOT_FOUND. Tampering — prefix StorageCleanup divalidasi regex (raw|parquet)/<cuid>/(<cuid>/)? dan
  dicek terhadap baris Dataset/versi yang masih hidup sebelum dihapus; id dari baris DB, bukan dari input.
  Repudiation — AuditLog dataset.version.activate. Info disclosure — daftar versi owner-scoped, pesan tanpa
  detail internal. DoS — rate limit aksi, batch job ≤ 50/100 per putaran, backoff + batas attempts.
- Rollback: revert commit T-013 + migrasi 20261014054628 hanya menambah kolom nullable/berdefault (aman
  dibiarkan). Versi yang sudah dihapus retensi tidak bisa dipulihkan (sesuai keputusan A4: simpan 3 READY).
- Validation: unit test logika murni (pencocokan kolom/sheet/baris judul, verdict ≥ 98%, retensi, validasi
  prefix + keputusan aman, backoff, cutoff 7 hari); e2e ganti data (AC1), gagal (AC2), 4 versi + rollback
  (AC3), file asli > 7 hari (AC4), kolom tidak cocok → menunggu pemetaan + buang versi; review 3 lensa sampai
  0 temuan; audit frontend-expert (AC5).

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:56:59Z Aktivasi/rollback hanya pemilik; job pembersihan menghapus prefix dengan '/' penutup; retensi raw 7 hari dan typed lama via job (MinIO lifecycle granularitas hari).
- 2026-10-11T23:58:30Z Dari review T-003: job pembersihan StorageCleanup wajib memvalidasi bentuk prefix (raw|parquet)/<cuid>/ sebelum menghapus, menaikkan attempts, dan menghapus baris setelah sukses.
- 2026-10-12T07:59:19Z Dari T-007: saat ini setiap versi yang selesai ingest diinferensi tipenya lalu langsung READY + aktif (finish di src/features/ingest/repo.ts). Jalur refresh T-013 harus menggantinya dengan cast memakai skema aktif per nama asli (tanpa inferensi), dan memperbarui kriteria macet bila menambah tahap.
- 2026-10-12T23:39:26Z Dari verifikasi T-011: setiap unggahan baru langsung aktif dengan id sheet baru. T-011 memetakan spec widget saat DIBACA (src/features/widgets/remap.ts: sheet lewat nama/satu-satunya sheet, kolom lewat nama; dipakai runWidgetQuery dan getDashboard). Saat aktivasi versi (dan sebelum retensi menghapus sheet lama), petakan lalu SIMPAN spec widget ke versi aktif agar tidak bergantung pada baris Sheet versi lama; widget yang kolomnya tidak ketemu ditandai untuk T-014.

- 2026-10-14 Keputusan desain T-013 (standar, diambil lead): (1) versi refresh = ingest saat dataset sudah punya
  versi aktif; versi pertama tetap inferensi. (2) Sheet dicocokkan lewat nama ternormalisasi (fallback satu↔satu);
  sheet baru tambahan diinferensi; sheet aktif yang hilang = tidak cocok. (3) Kolom dicocokkan lewat
  normName(nama asli) + urutan kemunculan (nama kembar/kosong); pilihan user (tipe, format, locale, nama tampil,
  sembunyi) dibawa sebagai override; kolom baru ikut tapi disembunyikan. (4) Baris judul aktif dicoba lebih dulu.
  (5) Cocok = semua sheet aktif ketemu, semua kolom aktif yang TAMPIL ketemu, cast ≥ 98%; kolom tersembunyi yang
  hilang tidak menghalangi. Tidak cocok → AWAITING_MAPPING + alasan; sementara T-014 belum ada, pemilik bisa
  "Buang versi ini". (6) Skema aktif berubah selama ingest → finish "stale" → BullMQ mengulang; recast/metadata
  hanya menulis ke versi yang masih aktif. (7) Aktivasi menyimpan spec widget ke sheet versi aktif bila
  semua kolom ketemu (kolom dicocokkan lewat judul asli + urutan, nama tampil hanya cadangan). Ada kolom hilang:
  spec dibiarkan di sheet lama (roll-forward memulihkannya) dan namanya dicatat di Widget.missingColumns —
  kecuali versi lama itu ikut dihapus retensi: spec disimpan ke sheet aktif dengan penanda kolom hilang. Widget
  yang sheet-nya tak terpetakan diarahkan (hanya tampilan) ke satu-satunya sheet aktif agar bisa diperbaiki. (8) Retensi saat aktivasi: simpan 3 READY terbaru + aktif; FAILED yang
  lebih tua dari READY terbaru dihapus; baris langsung dihapus, prefix storage dihapus job setelah ≥ 1 jam.
  (9) Rollback/roll-forward ke versi READY mana pun yang tersimpan; ditolak DATASET_BUSY selama ada versi non-terminal.
- 2026-10-14T16:32:53Z Conventions check (AC 5, /frontend-expert:audit lewat 13 putaran review dengan lensa frontend-expert:design-reviewer, render nyata): Tokens: preset project zinc-blue (src/styles/tokens.css), tanpa hex mentah — pass. Icons: waiver @tabler/icons-react (Tabler saja; size 20/16 stroke 1.5, aria-hidden; filled hanya untuk status Aktif) — pass. States: loading (pending tombol, Memproses/Menyimpan…), empty (kartu Riwayat versi disembunyikan bila kosong), error (FormAlert/FocusNotice dalam dialog, baris status error menempel di panel widget), success (FocusNotice berkunci), sibuk (catatan per keadaan) — pass. Responsive: 320/375/390/768/1024/1440/1920 terang+gelap, tanpa gulir horizontal, CTA lebar penuh < 768, tabel >= @3xl dan kartu di bawahnya — pass. A11y: axe-core WCAG 2.2 AA 0 serious/critical di semua putaran (riwayat versi, dialog aktifkan/buang, panel unggah, panel widget), fokus kembali ke pemicu, notifikasi menerima fokus, Tab berputar di lembar ponsel terlihat, kontrol fokus tidak tertutup baris menempel — pass. Tidak ada temuan Critical/High tersisa; pass review terakhir 0 temuan.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: Server Action aktifkan/buang versi (pemilik), worker (finish/retensi/job pembersihan), storage S3 — penghapusan hanya dari id DB tervalidasi
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi; aksi baru memakai requireUser('action') yang ada
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi; sesi nonaktif/dicabut ditolak requireUser
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — listVersions/activateVersion/discardVersion menguji Dataset.ownerId di bawah kunci baris; versionId dataset lain → NOT_FOUND (tanpa IDOR); worker hanya menyentuh id dari DB
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — id lewat isIdShape; prefix StorageCleanup regex ^(raw|parquet)/<cuid>/(<cuid>/)?$ + cek baris hidup; SQL mentah berparameter; nama kolom/sheet dari file hanya dirender sebagai teks React
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru yang disimpan
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — aksi mengembalikan {ok:false,code,message} tanpa detail internal; galat tak terduga → pesan umum, detail hanya di log pino
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — retensi 3 versi + file asli 7 hari menghapus data lama; uploadedBy (email) tidak dikirim ke klien; missingColumns tidak masuk WidgetView
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (S3 internal yang sama)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru; npm audit + osv-scanner 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — DATASET_BUSY saat versi non-terminal; snapshot skema dicek di bawah FOR UPDATE (stale → ulang); recast/metadata hanya ke versi aktif (FOR SHARE); retensi tidak pernah menghapus versi aktif; rate limit versionChange; batch job ≤ 50/100 + backoff + batas attempts
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — penghapusan storage hanya prefix tervalidasi milik baris yang sudah hilang/FAILED (tanpa path traversal); raw dihapus 7 hari; abort multipart sebelum hapus raw
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Server Action dengan cek Origin/Host bawaan Next; rate limit per pengguna; input diskema
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — migrasi hanya kolom nullable/berdefault; job maintenance terjadwal di worker; next build produksi bersih
