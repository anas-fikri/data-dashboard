---
id: T-f4a7
title: 'Filter pivot dinamis: saring nilai baris/kolom dari tabel, bagian Saring, dan klik untuk menyaring widget lain'
status: in_progress
profile: standard
created: "2026-10-19T15:04:54Z"
updated: "2026-10-19T16:29:04Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: a019f8fc8c1ba0ea0c9f9601c5683ba0862b6221
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 109260
    summary: |-
      …"code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792427237633,"service":"data-dashboard","host":"127.0.0.1","port":60461,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792427237641,"service":"data-dashboard","host":"127.0.0.1","port":60470,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792427237661,"service":"data-dashboard","host":"127.0.0.1","port":60472,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792427237703,"service":"data-dashboard","host":"127.0.0.1","port":60476,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792427243533,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792427243558,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792427243562,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792427243574,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792427249614,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  159 passed (159)
            Tests  2064 passed (2064)
         Start at  23:26:59
         Duration  75.50s (tests 79%, import 16%, transform 4%)

          Isolate  159 workers spawned · ~277ms startup each (spawn + environment, per file)
                   at least ~4.62s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T16:28:16Z"
    tree: 4c098c264a02f3363351bcf1ace060d73d79f3c858d65ed77c8686b626521385
---

## Objective
Widget pivot bisa disaring seperti PivotTable Excel tanpa mengubah pengaturannya: pembaca membuka menu saring per field (baris 1, baris 2, kolom pemisah) di sel pojok kepala tabel, mencari dan mencentang nilai (daftar dari mode pivotValues lewat otorisasi widget yang sama), dan subtotal/total mengikuti. Editor menambah bagian Saring tersimpan (kolom + nilai) di pengaturan pivot. Label baris/kolom pivot menjadi sumber filter silang untuk widget lain (sakelar "Klik label menyaring widget lain"). Saringan pembaca ikut URL (?f=), ekspor CSV/XLSX, dan PDF; catatan "Disaring — …" menyebutnya di layar dan kertas.

## Acceptance criteria
- [ ] Given widget pivot di dashboard, when pembaca membuka menu saring di kepala kolom baris atau kolom pemisah, then bisa mencari dan mencentang nilai yang ditampilkan (seperti filter PivotTable Excel) tanpa mengubah pengaturan widget, dan subtotal serta total mengikuti nilai yang dipilih
- [ ] Given editor mengatur pivot, when menambah bagian Saring (kolom + nilai, seperti Filters di PivotTable), then pivot hanya menghitung baris yang cocok dan pengaturan itu tersimpan
- [ ] Given pivot dengan Klik untuk menyaring widget lain aktif, when pembaca mengklik label baris atau kolom, then widget lain di dashboard tersaring ke nilai itu (filter silang) dan filter itu bisa dihapus dari bilah filter
- [ ] Given saringan pivot aktif, when pivot diekspor CSV/XLSX atau dashboard diekspor PDF, then hasilnya mengikuti saringan yang sama

## Risk
Impact: query pivot (WHERE src CTE + mode daftar nilai baru), status filter dashboard (FilterState.pivot di ?f=, filter-context), body /api/query dan /api/exports (field opsional pivotFilters/pivotValues, strict), spec pivot (filters?, crossFilter? opsional — spec lama tetap sah), sumber kolom filter silang (pivot ikut; getDashboard dan filterSourcesFor), panel pengaturan pivot, SlicerPanel dipecah jadi SlicerBody (slicer dashboard memakai isi yang sama). Tanpa migrasi DB.
Security (STRIDE): Information disclosure/Elevation — saringan pembaca merujuk PERAN field pivot (row0/row1/column), bukan kolom bebas, jadi viewer tidak bisa menyaring atau mendaftar nilai kolom di luar pivot itu (D6 tetap); mode pivotValues lewat resolveWidget yang sama (izin, kolom tersembunyi → COLUMN_UNAVAILABLE). Filter silang dari pivot hanya untuk kolom yang dihitung server (crossFilterColumnsOf/filterSourcesFor, sakelar crossFilter). Tampering — semua nilai di-bind sebagai parameter DuckDB ($l*, $f*), identifier hanya c<pos>; skema zod strict (≤ 3 saringan, ≤ 500 nilai). DoS — daftar nilai dibatasi 500 + LIMIT 501, query lewat slot/timeout yang sama; hasil di-cache dengan kunci yang memuat bentuk saringan.
Rollback: revert commit T-f4a7; URL/ekspor lama tanpa pivot tetap valid. Spec pivot yang sudah menyimpan filters/crossFilter perlu dibuang field-nya bila versi lama dipasang lagi (parse strict versi lama menolaknya → widget tampil "pengaturan tidak valid" sampai diatur ulang).
Validation: unit DuckDB nyata (pivot.test.ts: baris/kolom/(kosong), daftar nilai, Saring tersimpan, salah tipe), unit klien (pivot-filters.test.ts: round-trip ?f=, sanitize, body permintaan/ekspor/PDF, model + render PivotView, kolom silang server = klien, panel Saring), job ekspor CSV tersaring, e2e pivot 8/8 (menu saring + URL + ekspor CSV + PDF, Saring tersimpan, sakelar, klik label → KPI tersaring + chip), e2e filters 6/6, aitk check lulus.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — tidak ada komponen baru: saringan pivot lewat jalur query widget yang sama (/api/query widget mode → resolveWidget → DuckDB), daftar nilai Saring editor lewat mode pratinjau dashboard yang sudah ada
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — pivotFilters/pivotValues merujuk peran field pivot (row0/row1/column), bukan kolom bebas — viewer tidak bisa menyaring/mendaftar kolom di luar pivot (D6); mode nilai memakai otorisasi widget yang sama; filter silang dari pivot hanya kolom yang dihitung server (crossFilterColumnsOf, filterSourcesFor dengan pivot) dan sakelar crossFilter; daftar nilai Saring hanya untuk pemilik/editor (mode dashboard)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — body/params zod strict (enum peran, op in/not_in, ≤ 3 saringan, ≤ 500 nilai, teks ≤ 2.000); nilai salah tipe dilewati (pembaca) atau widget tidak tersedia (Saring tersimpan); SQL hanya identifier c<pos> + parameter terikat $l*/$f*
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — gagal memuat daftar nilai → pesan + Coba lagi di menu, tabel tetap; field yang hilang → INVALID dengan petunjuk muat ulang; nilai saringan tidak dicatat di log
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — daftar nilai hanya label field yang sudah tampil di pivot itu; catatan saringan menyebut nilai yang dipilih sendiri / pengaturan widget; cache kunci terpisah per bentuk saringan
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — total/subtotal dihitung dari data yang lolos saringan (satu WHERE untuk semua cabang UNION); not_in menyertakan sel kosong kecuali (Kosong) dikecualikan, sama dengan filter dashboard; ekspor/PDF memakai body yang sama dengan layar
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak ada berkas baru; daftar nilai LIMIT 501 + slot/timeout query yang sama
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — dua field opsional baru di /api/query widget mode dan satu di /api/exports (strict), jawaban berbentuk sama (+ pivotValues/pivot.filters opsional)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa konfigurasi baru; npm audit 0 kerentanan
