---
id: T-074
title: Bangun UI kelola pivot tersimpan dan pilih sumber di panel widget
status: in_progress
profile: standard
profile_pinned: true
goal: G-7
tags:
  - ui
depends_on:
  - T-073
  - T-069
created: "2026-10-21T10:24:15Z"
updated: "2026-10-21T18:24:20Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 1ad5b22a9af109768f78bdb379c3d6a9adec3cee
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 242986
    summary: |-
      …asetId":"t072mvifwuhpds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792606981856,"service":"data-dashboard","host":"127.0.0.1","port":33113,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792606981912,"service":"data-dashboard","host":"127.0.0.1","port":45199,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792606982015,"service":"data-dashboard","host":"127.0.0.1","port":42035,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792606982117,"service":"data-dashboard","host":"127.0.0.1","port":46763,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792606996041,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792607007174,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792607007196,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792607007203,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792607007219,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  223 passed | 1 skipped (224)
            Tests  3007 passed | 10 skipped (3017)
         Start at  18:21:17
         Duration  146.98s (tests 83%, import 14%, transform 2%)

          Isolate  224 workers spawned · ~155ms startup each (spawn + environment, per file)
                   at least ~11.43s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T18:23:46Z"
    tree: 0e3869d8545c6f96da119492560f2a2da2581c066f182b42401cf7c61c87faea
  audit:
    at: "2026-10-21T18:23:49Z"
    passed: true
    tree: 0e3869d8545c6f96da119492560f2a2da2581c066f182b42401cf7c61c87faea
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 4993 inodes visited, 1 Extract calls, 249.036575ms elapsed, 249.036928ms wall time
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
Daftar 'Pivot tersimpan' di halaman dataset, editor pivot tersimpan (baris, kolom, nilai + field terhitung + Tampilkan nilai sebagai, Saring, Top N) dengan pratinjau, simpan dari widget pivot yang ada, dan pilihan 'Sumber: Pivot tersimpan' di panel widget. Lewat frontend-expert. Rencana G-7 §3.3.

## Acceptance criteria
- [ ] Given pemilik dataset, when membuka tab 'Pivot tersimpan' di halaman dataset, then tampil daftar Nama | Sheet | Dipakai di (N widget, M dashboard) | Diubah, dengan aksi Ubah, Ganti nama, Duplikat, Hapus (Hapus nonaktif + tooltip daftar dashboard bila dipakai)
- [ ] Given editor pivot tersimpan, when pemilik mengubah lalu Simpan, then dialog konfirmasi 'Perubahan berlaku di N widget pada M dashboard' muncul bila N > 0; given revisi basi (tab lain menyimpan dulu), then pesan konflik dengan opsi muat ulang, tanpa menimpa
- [ ] Given widget pivot biasa, when 'Simpan sebagai pivot tersimpan', then pivot tersimpan baru dibuat dan widget langsung terikat; given panel widget bar/line/pie/KPI/tabel, when 'Sumber: Pivot tersimpan' dipilih, then hanya pilihan tampilan yang relevan muncul (dimensi = baris pertama/kolom pemisah, satu nilai; KPI satu nilai) dan 'Lepas dari sumber' menyalin spec menjadi widget mandiri
- [ ] Given editor dashboard (bukan pemilik dataset), then bisa memilih pivot tersimpan sebagai sumber dan melihat definisinya (baca-saja) tetapi tidak mengubah/menghapus; viewer tidak melihat menu ini sama sekali
- [ ] Given lebar 360 px dan hanya keyboard, then daftar dan editor bisa dipakai tanpa gulir horizontal, dialog konfirmasi fokus terkunci, ikon Tabler size 20 stroke 1.5; /frontend-expert:audit tanpa Critical/High dan Conventions check terisi

## Risk
- Impact: panel widget (semua widget dashboard memakai WidgetSourceSection), halaman dataset (kartu baru), dua halaman baru /datasets/[id]/pivot-tersimpan/{baru,[pivotId]}; pratinjau Saring/field terhitung kini juga lewat query pemilik { datasetId, spec }.
- Security (STRIDE): Elevation/Info disclosure — tanpa endpoint/aksi baru; tulis tetap lewat Server Action T-072 (pemilik saja, NOT_FOUND), ikat/lepas lewat PATCH T-073 (pivot wajib sedataset). Halaman pivot tersimpan memakai getDataset (pemilik) → 404 untuk editor/viewer. Daftar untuk panel dibaca listSavedPivots (pemilik/editor; viewer tidak pernah sampai mode edit). Tampering — tampilan divalidasi ulang server (effectiveConfig + checkConfig).
- Rollback: revert commit T-074 (UI saja; tidak ada migrasi). Widget terikat tetap berjalan (T-073) tanpa UI.
- Validation: unit tests/components/bound-config.test.ts (11) + saved-pivot-ui.test.ts (6) + uji komponen pivot/calc yang ada; e2e tests/e2e/saved-pivot-widgets.spec.ts (8, project widgets); regresi --project=widgets 23 lulus (sebelum tes simpan-sebagai ditambah), --project=pivot 11 lulus.

## Notes
- Daftar: kartu "Pivot tersimpan" (#pivot-tersimpan) di halaman dataset (halaman ini berupa tumpukan kartu, bukan tab — keputusan standar), tabel Nama | Sheet | Dipakai di | Diubah (≥ 768 px), kartu bertumpuk di ponsel. Hapus pivot yang dipakai: aria-disabled (tetap bisa difokus), title + teks alasan (aria-describedby) menyebut jumlah widget dan nama dashboard (`usage.usedIn` baru di SavedPivotView pemilik).
- Editor: /datasets/[id]/pivot-tersimpan/baru dan /[pivotId] memakai PivotFields yang sama dengan panel; lingkup query pratinjau digeneralisasi (`query-scope.ts`: { dashboardId } | { datasetId }). Konfirmasi dampak bila widget > 0; CONFLICT/STALE → FormAlert + "Muat ulang" (memuat ulang halaman, editor dipasang ulang per revisi).
- Asumsi (keputusan standar): pratinjau di editor = kalimat ringkasan bentuk tabel + nilai contoh field terhitung + nilai kolom Saring; tabel pivot penuh belum (butuh mode query pivot pemilik baru di server — di luar UI, task lanjutan T-c6z4). Nilai pratinjau sebenarnya terlihat di widget yang terikat.
- Panel: "Sumber data" Sheet langsung | Pivot tersimpan. Terikat → BoundConfigForm (tampilan per jenis, cek effectiveConfig sebelum simpan otomatis, simpanan selalu membawa savedPivotId — perbaikan T-073 L4); kartu definisi baca-saja (ringkasan) + "Ubah pivot tersimpan" (pemilik) + "Lepas dari sumber" (konfirmasi; satu-satunya jalan kembali ke sheet langsung, fokus ke pemberitahuan hasil). Widget pivot mandiri pemilik: "Simpan sebagai pivot tersimpan" (buat lalu ikat dengan tampilan yang sama).
- Urungkan hapus widget terikat memulihkan spec efektif sebagai widget mandiri (perilaku undo lama; dicatat, tidak diubah).
- Dilewati: plugin frontend-expert (/frontend-expert:audit) tidak tersedia di sesi cloud — prinsip diterapkan manual (Conventions check). Bagian audit AC5 menunggu orkestrator/pemilik.
- e2e regresi: dashboards.spec gagal acak "klik Pengaturan setelah muat" = T-z8y2 (sudah ada); sharing.spec:1849 ("Urungkan nanti") juga gagal di HEAD dasar 1ad5b22 tanpa perubahan T-074 (diverifikasi dengan git stash) → task lanjutan T-ev34.

## Conventions check
- Tokens: kelas dari token (`--control-h-lg` 44 px, primary/destructive/warning/muted/overlay); tanpa hex mentah
- Icons: @tabler/icons-react saja (IconTableShare, IconFileSpreadsheet, IconBookmarkPlus, IconUnlink, IconPencil, IconCursorText, IconCopy, IconTrash, IconPlus, IconDeviceFloppy, IconRefresh, IconArrowLeft, IconAlertCircle), size 20 stroke 1.5 (lewat Button atau eksplisit)
- Audit: plugin frontend-expert tidak tersedia di sesi cloud; prinsip diterapkan manual
- States: daftar kosong / dipakai (hapus nonaktif + alasan) / konflik + muat ulang / sumber tidak ada di daftar / jenis tanpa nilai sah / tampilan tidak cocok (pesan server effectiveConfig) / simpan Menyimpan…–Tersimpan–gagal
- Responsive: 360 px tanpa gulir horizontal (e2e daftar, editor, panel terikat), CTA full-width < 768, target ≥ 44 px
- A11y: radio "Sumber data" (fieldset/legend), dialog Radix (fokus terkunci, awal di Batal), aria-disabled + aria-describedby untuk Hapus, FormAlert difokus saat galat, fokus ke pemberitahuan setelah Lepas dari sumber

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — terverifikasi: UI saja; server (Server Action T-072, PATCH widget T-073, /api/query) tetap penentu akses dan validasi
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi (halaman baru memanggil requireUser)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — terverifikasi: halaman pivot tersimpan getDataset(pemilik) + getSavedPivot sedataset + canEdit → 404 (e2e editor/viewer); getDatasetSources hanya dataset milik user; tanpa endpoint baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — terverifikasi: nama/spec divalidasi service T-072 (zod/checkConfig), tampilan oleh parseBoundDisplay/effectiveConfig server; teks dirender React (ter-escape)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — terverifikasi: UI menampilkan pesan Indonesia dari service; penolakan tetap dicatat service T-072
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — terverifikasi: nama dashboard pemakai (usedIn) hanya untuk pemilik dataset (pemilik semua dashboard-nya); editor mendapat usage null
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — terverifikasi: tanpa dependensi baru; fetch hanya ke /api milik aplikasi
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — terverifikasi: CAS revisi (CONFLICT + muat ulang, e2e), IN_USE tetap ditegakkan server, batas 50 + rate limit T-072; lepas hanya lewat aksi eksplisit
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa unggahan/berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — terverifikasi: body PATCH ketat T-073 ({type,spec,savedPivotId} / {detach,version}); query pemilik { datasetId, spec } strict + rate limit query yang ada
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa perubahan konfigurasi
