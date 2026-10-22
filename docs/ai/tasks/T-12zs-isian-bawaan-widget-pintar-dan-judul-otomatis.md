---
id: T-12zs
title: Isian bawaan widget pintar dan judul otomatis
status: in_review
profile: standard
tags:
  - ui
created: "2026-10-22T03:19:56Z"
updated: "2026-10-22T05:13:35Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 829d5bab56ef4100795313a3613e2ae81694285c
review:
  passes:
    - "n": 1
      by: claude-code
      at: "2026-10-22T04:22:15Z"
      findings: 7
    - "n": 2
      by: claude-code
      at: "2026-10-22T04:29:23Z"
      findings: 4
    - "n": 3
      by: claude-code
      at: "2026-10-22T04:34:53Z"
      findings: 3
    - "n": 4
      by: claude-code
      at: "2026-10-22T04:42:13Z"
      findings: 2
    - "n": 5
      by: claude-code
      at: "2026-10-22T05:13:28Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 199983
    summary: |-
      …olak NAS"}
      {"level":40,"time":1792644292834,"service":"data-dashboard","host":"127.0.0.1","port":38519,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792644310203,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792644310224,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792644310227,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792644310236,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792644322050,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792644322068,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  224 passed | 3 skipped (227)
            Tests  3024 passed | 29 skipped (3053)
         Start at  04:43:21
         Duration  142.28s (tests 84%, import 13%, transform 3%)

          Isolate  227 workers spawned · ~110ms startup each (spawn + environment, per file)
                   at least ~8.20s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T04:45:45Z"
    tree: d1d6f81bc2e0a9556999c1ed650c37317f416d19f64d504e86e0370b1cf5aee9
---

## Objective
Widget baru langsung masuk akal tanpa diatur ulang: isian bawaan "kolom angka/teks pertama" (sering
menghasilkan "Total No." — menjumlah nomor urut) diganti skor deterministik dari statistik skema yang
sudah tersimpan saat ingest (distinctCount, nullPct, nonEmpty; diteruskan ke SourceColumn). Ukuran
melewati kolom ID/nomor (nama No./ID/Kode/Nomor, atau bilangan bulat dengan nilai unik ≥ 95% sel
terisi kecuali namanya besaran), dimensi memilih kolom teks 2–50 nilai unik yang jarang kosong, Garis
memakai kolom tanggal per bulan; tanpa statistik kembali ke perilaku lama. Judul kosong/belum diketik
mengikuti judul turunan ("Total Omzet per Cabang") dan tersimpan, berhenti mengikuti begitu pengguna
mengetik judul sendiri. Tanpa migrasi DB. Panduan 06 dan 13 disesuaikan.

## Acceptance criteria
- [x] Widget baru Batang/Garis/Pai/Pivot/Angka/Tabel tidak memakai kolom ID/nomor urut (distinctCount ≈ jumlah baris atau nama No./ID/Kode) sebagai ukuran, dan memilih dimensi kategori 2–50 nilai unik serta kolom tanggal untuk Garis
- [x] Judul kosong tampil dan tersimpan sebagai judul turunan (mis. Total Omzet per Cabang) sampai pengguna mengetik judul sendiri
- [x] Panduan 06/13 disesuaikan (panel terbuka otomatis, contoh tidak lagi Total No.)

## Risk
Impact: hanya isian AWAL widget baru / pindah jenis (widget tersimpan tidak berubah) dan judul widget
yang kosong atau masih sama dengan judul turunan. Heuristik bisa salah tebak (mis. bilangan bulat unik
tanpa nama besaran dianggap ID) — pengguna tetap bisa mengganti; ditutup uji unit.
Security (STRIDE): S/R/E — tidak ada jalur akses baru; sumber panel tetap hanya untuk pemilik/editor
(getDashboardSources/getDatasetSources), statistik hanya untuk kolom yang tampil. I — distinct/nullPct
kolom tampil bukan rahasia baru (editor sudah bisa menghitungnya lewat widget). T — judul otomatis
lewat PATCH rename yang sama (validasi + versi). D — tidak ada query tambahan; satu PATCH judul
tambahan per simpanan pengaturan yang mengubah judul turunan.
Rollback: revert commit; tidak ada migrasi/data baru (judul yang sudah tersimpan tetap judul biasa).
Validation: tests/components/smart-defaults.test.ts (10 uji), pivot-ui/roles disesuaikan, e2e
widgets.spec.ts "T-12zs …", pivot.spec.ts (fixture No. → Ongkir), suite e2e penuh.

## Notes
- Panduan berubah: slug `susun-dashboard` (06) dan `widget-pivot` (13). Di produksi perlu
  `npx tsx scripts/seed-guides.ts --update --only susun-dashboard,widget-pivot` (dijalankan pemilik saat
  deploy; video panduan 06/13 tidak direkam ulang — narasinya mungkin masih menyebut "buka pengaturannya").
- Asumsi (keputusan standar): aturan keunikan ≥ 95% hanya untuk bilangan bulat (nominal desimal per
  transaksi wajar unik) dan dikecualikan bila nama kolom besaran (Omzet, Harga, Jumlah, …); di bawah 20
  sel terisi tidak dinilai. Beralih ke Garis dari batang/pai berkategori kini memakai kolom tanggal.
  Mengosongkan judul = kembali ke judul otomatis. Widget lama tanpa judul baru mendapat judul otomatis
  saat pengaturannya diubah (kolom Judul menampilkannya sebagai contoh).
- 2026-10-22T05:13:35Z Review 5 putaran (subagen): 7/4/3/2/0 temuan; semua Critical/High 0; temuan fungsional diperbaiki; Low (gagal ganti judul otomatis, widget lama tanpa judul, konflik sesaat) → T-d1ns. Tes e2e saved-pivot-widgets AC3 diperbaiki (menunggu PATCH ikatan, sebelumnya balapan dengan toolbar tata letak). e2e dijalankan dengan Chromium 1194 (symlink) karena 1248 tidak tersedia di VM.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified — boundary unchanged: stats are read server-side in sourceSheets (same owner/editor-scoped query, visible columns only); heuristics run client-side on that list.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — no authentication change.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — no session change.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified — no new endpoint; auto title uses existing PATCH /widgets/[id] rename (requireUser + canEdit + version); sources still [] for viewer/org/stranger (roles.test.ts).
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified — derived title goes through normalizeName + WIDGET_TITLE_MAX on client and the server's existing title validation; rendered as React text (no HTML).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — no stored secrets/crypto.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — verified — a failed auto rename is ignored silently (no internals shown); config errors unchanged.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — verified — only aggregate stats (distinct count, null ratio, filled count) of columns the editor can already query; no row values added.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — no external traffic.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified — no new dependencies or network calls beyond the existing rename API.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified — one extra rename PATCH only when the derived title changes; queued in the same serial editor queue after the config save, using the returned version (no lost update of a user-typed title).
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — no file handling.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified — rename/config inputs validated by existing zod schemas server-side; no new API.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — no configuration change.
