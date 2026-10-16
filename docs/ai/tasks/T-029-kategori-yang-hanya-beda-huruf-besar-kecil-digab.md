---
id: T-029
title: Kategori yang hanya beda huruf besar/kecil digabung seperti pivot Excel
status: in_progress
profile: standard
profile_pinned: true
created: "2026-10-12T23:39:16Z"
updated: "2026-10-16T17:57:17Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 41a5b3ac5db492718fdd9976209089362eb617ea
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 41213
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

      {"level":40,"time":1792173413465,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792173413492,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792173413503,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  119 passed (119)
            Tests  1698 passed (1698)
         Start at  00:56:47
         Duration  28.00s (tests 75%, import 18%, transform 7%)

          Isolate  119 workers spawned · ~128ms startup each (spawn + environment, per file)
                   at least ~1.56s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T17:57:17Z"
    tree: b9d933805304117ec27088ac0921c87c9925603aac972742431e9fe37c55dbf2
---

## Objective
Ditemukan verifikasi integritas T-011: GROUP BY pada dimensi teks memisahkan 'Bandung' dan 'BANDUNG', berbeda dari PivotTable/SUMIF/UNIQUE Excel yang tidak peka huruf besar/kecil. Putuskan perilaku bawaan (gabung tidak peka huruf) dan label tampil (nilai paling sering).

## Acceptance criteria
- [ ] Given dataset dengan 'Bandung', 'bandung', 'BANDUNG', when widget batang dikelompokkan per kolom itu, then satu kategori dengan total gabungan dan label nilai yang paling sering
- [ ] Given filter = 'bandung', when diterapkan, then baris ketiga variasi itu ikut

## Risk
Impact: lapisan query (src/features/query/sql.ts) untuk semua widget grafik, KPI berfilter, tabel berfilter, ekspor CSV/XLSX/PDF, dan daftar nilai slicer: dimensi teks dikelompokkan lower(...) dengan label variasi paling sering lewat histogram() (seri → urutan byte terkecil, deterministik lintas thread/row group; mode() DuckDB tidak — review T-029 TF3/INT-1); filter teks widget (in/not_in/eq/neq) dan dashboard (slicer, filter silang) dicocokkan lower di kedua sisi; jumlah kategori ikut digabung. Aksen dan spasi tetap membedakan (seperti Excel). Hasil cache lama (LRU memori, TTL) bisa tampil sampai kedaluwarsa. Tidak digabung: count_distinct kolom teks (PlanMeasure tanpa tipe kolom). Security (STRIDE): tidak ada permukaan baru — nilai tetap parameter ($p/$f), fungsi lower/mode konstanta. Rollback: revert commit sql.ts. Validation: tes SQL builder di DuckDB sungguhan (grup, label, total kategori, filter widget/dashboard, not_in, slicer) gagal tanpa perbaikan; label seri diuji lintas 32 row group × 4 thread (10× sama); uji mutasi mode()/first() gagal. Biaya terukur (2 thread): 3 juta baris/100 ribu kategori 32 → 131 ms; 5 juta baris/4 juta kategori 0,30 → 1,17 s (di bawah batas waktu query, tetapi perlu diukur ulang terhadap target p95 < 3 s di T-024; optimasi: label hanya untuk N kategori teratas). e2e penuh 158/158.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — perubahan hanya pembentuk SQL query (src/features/query/sql.ts); otorisasi, resolver spesifikasi, dan sandbox DuckDB tidak berubah
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — akses widget/dashboard tetap lewat resolver /api/query yang sama (D6); tidak ada endpoint baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — nilai filter tetap lewat parameter binding ($p/$f); lower()/mode() dan identifier c<pos> buatan program; tidak ada teks user di SQL
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: jalur galat query tidak berubah
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi baru; jawaban per peran tidak berubah
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — total per kategori kini sama dengan PivotTable/SUMIF Excel (variasi huruf besar/kecil digabung); filter 'bandung' mengenai semua variasi; batas waktu/slot query tidak berubah (biaya tambahan kecil, diukur)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak menyentuh berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — bentuk jawaban /api/query dan nilai slicer tidak berubah (label = salah satu variasi asli)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru
