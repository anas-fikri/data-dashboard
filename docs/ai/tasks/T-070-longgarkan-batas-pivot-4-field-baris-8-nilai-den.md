---
id: T-070
title: 'Longgarkan batas pivot: 4 field baris, 8 nilai, dengan anggaran sel'
status: blocked
profile: strict
profile_pinned: true
goal: G-7
tags:
  - query
  - ui
depends_on:
  - T-068
created: "2026-10-21T10:24:09Z"
updated: "2026-10-21T15:21:07Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 52486eb4002b86e8dd134e0788d8022fd3ae959a
paths:
  - CHANGELOG.md
  - docs/runbook-deploy.md
  - scripts/perf-pivot-levels.ts
  - scripts/perf.mjs
  - src/components/dashboards/calc-editor-model.ts
  - src/components/dashboards/calc-editor.tsx
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/filters/filter-model.ts
  - src/components/dashboards/pivot-config-model.ts
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/use-grid-width.ts
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/render/print-card.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/kpi-fit.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/pivot-filter-menu.tsx
  - src/components/widgets/pivot-markup.tsx
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-query.ts
  - src/features/exports/job.ts
  - src/features/exports/pivot.ts
  - src/features/query/filters.ts
  - src/features/query/pivot.ts
  - src/features/query/spec.ts
  - src/features/query/sql.ts
  - src/features/query/widget.ts
  - src/features/widgets/calc-tokens.ts
  - src/features/widgets/calc.ts
  - src/features/widgets/pivot-table.ts
  - src/features/widgets/remap.ts
  - src/features/widgets/spec.ts
  - tests/components/calc-editor.test.ts
  - tests/components/pivot-ui.test.ts
  - tests/e2e/calc-widgets.spec.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/pivot.spec.ts
  - tests/e2e/widgets.spec.ts
  - tests/features/exports/fixtures.ts
  - tests/features/exports/job.test.ts
  - tests/features/query/calc.test.ts
  - tests/features/query/pivot-legacy-cases.ts
  - tests/features/query/pivot-levels.test.ts
  - tests/features/query/pivot.test.ts
  - tests/features/widgets/calc-tokens.test.ts
  - tests/features/widgets/calc.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T15:16:48Z"
      findings: 3
    - "n": 2
      by: claude-code
      at: "2026-10-21T15:16:49Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 228595
    summary: |-
      …: disk penuh","msg":"cache urutan grid gagal dibangun"}
      {"level":40,"time":1792595993193,"service":"data-dashboard","host":"127.0.0.1","port":39687,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792595993252,"service":"data-dashboard","host":"127.0.0.1","port":34953,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792595993356,"service":"data-dashboard","host":"127.0.0.1","port":33663,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792595993475,"service":"data-dashboard","host":"127.0.0.1","port":33747,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792596005345,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792596016295,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792596016319,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792596016321,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792596016334,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  213 passed | 1 skipped (214)
            Tests  2891 passed | 10 skipped (2901)
         Start at  15:17:57
         Duration  159.53s (tests 84%, import 13%, transform 3%)

          Isolate  214 workers spawned · ~165ms startup each (spawn + environment, per file)
                   at least ~11.61s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T15:20:38Z"
    tree: d30a8fc83037d23daf33e99759536b803c542271d2f1e6e4454ebecb5fd174cc
  commits:
    - 14e93e4
    - 17cb5cc
    - 20985af
    - 4115c8d
    - 468e913
    - 52486eb
    - 60920fa
    - 693edf2
    - 6f54377
    - 864037d
    - 8ce72cf
    - a4869d3
    - a80b5ae
    - a821c13
    - c4a56e5
    - d13f79e
    - d23d4b2
    - d76daf2
    - f9bd2d5
  acceptance:
    total: 5
    done: 4
  audit:
    at: "2026-10-21T15:20:39Z"
    passed: true
    tree: d30a8fc83037d23daf33e99759536b803c542271d2f1e6e4454ebecb5fd174cc
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 520 dirs visited, 4627 inodes visited, 1 Extract calls, 260.918887ms elapsed, 260.919377ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Pivot baris 1–4 (kini 2) dan nilai 1–8 (kini 3), subtotal per level, dengan anggaran sel agar hasil ≤ 5 MB, PDF, dan ponsel tetap aman. Rencana G-7 §3.4, §6.

## Acceptance criteria
- [x] Given pivot 4 field baris × kolom pemisah × 8 nilai pada fixture, when dimuat, then baris bertingkat tampil dengan subtotal per level (sakelar 'Subtotal' per level), total dari seluruh data, dan hasil identik dengan kueri GROUP BY acuan untuk 1–4 level (uji properti/regresi pada spec 1–2 level lama)
- [x] Given baris tampil × kolom tampil × nilai > PIVOT_CELLS_MAX (24.000), then kolom tampil dipangkas otomatis (minimal 1) dengan catatan 'Menampilkan N dari M kolom — kurangi nilai atau tambah Saring', ukuran JSON ≤ batas hasil 5 MB, dan total tetap mencakup semua kolom
- [x] Given ekspor PDF dashboard dengan pivot 4 level × 8 nilai, then PrintPivot memotong kolom/baris yang muat per halaman dengan catatan 'terpotong' (fittingPivotRows/keepColumns) dan tidak ada teks bertumpuk; given CSV/XLSX, then semua level baris menjadi kolom terpisah
- [ ] Given lebar 360 px, then pivot bergulir di dalam kartu (bukan halaman), kolom label baris beku, level 3–4 diindentasi dengan label ringkas, dan panel konfigurasi tetap muat; /frontend-expert:audit tanpa Critical/High
- [x] Given perf lokal (fixture 1 jt baris, 4 level × 8 nilai), then p95 kueri pivot dicatat di docs/ai/perf/T-070.md dan ≤ 2× pivot 2 level × 3 nilai yang sama; bila tidak, batas default diturunkan (mis. 6 nilai) dan dicatat

## Risk
- Impact: spec pivot (batas 4 baris/8 nilai, `subtotalLevels` opsional), pembangun SQL pivot (`src/features/query/pivot.ts`), bentuk PivotData (`nest` untuk ≥ 3 baris), model tabel/ekspor/markup/panel. Spec 1.0.0 (≤ 2 baris, ≤ 3 nilai) memakai SQL, bentuk hasil, dan kunci cache yang sama persis (golden HEAD 52486eb) — dashboard yang sudah ada tidak berubah. Tanpa migrasi DB.
- Security (STRIDE): Tampering/Injection — tidak ada SQL dari klien; identifier hanya alias program (k0..k3, g1..g3, s1..s3, agg, rw0) + kolom dari skema; peran saringan pembaca baru `row2`/`row3` lewat enum zod tertutup dan hanya memetakan ke field yang dipakai pivot itu (D6 tidak berubah). DoS — anggaran sel 24.000 + pasangan ≤ 16.000 dihitung server (SQL) sehingga hasil ≤ 5 MB (uji kasus terburuk), batas 200 baris tampil tetap, timeout query tetap.
- Rollback: revert commit T-070. Spec yang sudah disimpan dengan > 2 baris/> 3 nilai menjadi tidak valid di versi lama (widget menampilkan galat pengaturan, data tidak hilang); sebelum rollback, kurangi baris/nilai widget tersebut.
- Validation: `tests/features/query/pivot-levels.test.ts` (41: GROUP BY acuan 1–4 level termasuk uji properti 16 spec acak, anggaran sel, ≤ 5 MB, showAs 4 level, ekspor 4 kolom label, golden spec lama), `tests/components/pivot-ui.test.ts` (+5), e2e `--project=pivot` 10/10, perf `docs/ai/perf/T-070.md`.

## Notes
- Spec: `PIVOT_ROWS_MAX` 4, `PIVOT_VALUES_MAX` 8, `PIVOT_CELLS_MAX` 24.000 (`src/features/widgets/spec.ts`). Subtotal per level: `subtotals` (sakelar utama, bentuk 1.0.0) + `subtotalLevels` opsional (1–3) hanya bila tidak semua level; `pivotSubtotalLevels()` = level efektif. Panel: satu sakelar per level induk (`pivot-subtotals`, `-2`, `-3`), "Rinci lagi" sampai 4 tingkat; `withRows`/`toggleSubtotal` menjaga bentuk ringkas (≤ 2 baris kembali ke bentuk 1.0.0).
- SQL: spec 1.0.0 → cabang UNION lama (byte-identik). Bentuk baru (> 2 baris atau > 3 nilai): anggaran sel di CTE `bud`/`cols` (baris tampil = terdalam + subtotal; kolom tampil = min(40, 24.000 // (baris × nilai), 16.000 // baris), min. 1), semua agregat satu pindaian `GROUPING SETS` (`agg`), urutan level `r` di CTE kelompok, label teks baris terdalam hanya untuk 200 baris tampil (`rw0` → `rws`). Total/subtotal tetap dari seluruh data (LEFT JOIN, disaring per set).
- Show values as: sumbu total berjalan/selisih tanpa pemisah = baris terdalam di dalam kelompok induk (semua level induk); % total baris pada subtotal dibagi total baris kelompoknya di levelnya (`st` per level, `lv`).
- Catatan anggaran: "Menampilkan N dari M kolom — kurangi nilai atau tambah Saring; total tetap mencakup semua baris dan kolom." (kartu + baris catatan ekspor); PDF memakai `printPivotNote` yang sudah ada ("N dari M kolom …").
- 360 px: kolom label dibatasi lewat kotak isi (`max-w-[18rem]`, ponsel 8rem — max-width sel tabel diabaikan pada tabel `w-max`), indentasi per level (ponsel lebih kecil), label level 3–4 maks. 2 baris di layar sempit dengan `title` teks utuh (DOM tetap teks utuh untuk pembaca layar).
- Perf (AC5): 4×8 p95 = 1,96× / 1,99× (dua putaran) — lulus tipis; biaya terbesar Jumlah unik. Batas tetap 8; bila T-075 (10 jt, VM) > 2× turunkan ke 6 (4×6 = 1,45×). Rincian `docs/ai/perf/T-070.md`, skrip `npm run perf -- pivot`.
- Review putaran 1 (0 blokir) diperbaiki: M1 catatan rollback (runbook-deploy §7 R + CHANGELOG [Unreleased]: versi lama menolak widget > 2 baris/> 3 nilai/subtotalLevels sebagai "tidak valid" dan mengabaikan seluruh `?f=` bila ada saringan row2/row3, PDF ditolak); L2 `withRows` memetakan sakelar subtotal per field (hapus baris tengah tidak menggeser); L3 widget.ts memakai `pivotSubtotalLevels` untuk semua bentuk (2 baris: sama dengan panel; spec lama identik); uji tambahan baris terdalam > 200 untuk 3–4 tingkat (subtotal kelompok terpotong = seluruh kelompok).
- Dilewati: /frontend-expert:audit (plugin tidak tersedia di sesi cloud) — AC4 bagian audit menunggu pemilik/orkestrator; prinsip diterapkan manual (Conventions check).

## Conventions check
- Tokens: kelas Tailwind dari token yang sudah ada (muted/card/border/primary), tanpa hex mentah
- Icons: tanpa ikon baru (AddButton/RemoveButton/ToggleField yang sudah ada, Tabler)
- Audit: plugin frontend-expert tidak tersedia di sesi cloud; prinsip diterapkan manual
- States: kelompok tanpa subtotal = kepala tanpa angka; catatan anggaran sel; kosong "Tidak ada data"
- Responsive: 360 px — gulir di dalam kartu, halaman tanpa gulir horizontal, kolom label beku ≤ 60% kartu, panel muat (e2e)
- A11y: kepala baris `th scope=row` tiap level, label ringkas hanya visual (teks utuh di DOM + title), sakelar subtotal per level berlabel "Subtotal per <kolom>", tombol hapus "Hapus rincian baris ke-N"

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — terverifikasi: batas kepercayaan tidak berubah — spec dari DB divalidasi zod (parseWidgetConfig), SQL dibangun server (pivot.ts) dari skema
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — terverifikasi: tanpa endpoint baru; viewer tetap { widgetId, dashboardFilters, pivotFilters? } (D6); peran row2/row3 hanya memetakan ke field yang dipakai pivot itu (widget.ts `at`), kolom lain tidak terbuka
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — terverifikasi: rows ≤ 4, values ≤ 8, subtotalLevels 1–3 unik (zod); identifier SQL hanya alias program + c<pos> dari skema; nilai saringan tetap parameter; uji properti DuckDB = GROUP BY acuan
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa kriptografi
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — terverifikasi: galat validasi lewat pesan parseWidgetConfig yang sudah ada; catatan anggaran tanpa detail internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: data yang sama dengan pivot sebelumnya; kunci cache memuat shape (levels) sehingga hasil tidak tertukar
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — terverifikasi: tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — terverifikasi: anggaran sel 24.000 + pasangan ≤ 16.000 di SQL (server), hasil ≤ 5 MB pada kasus terburuk (uji), 200 baris tampil + timeout query tetap; perf 4×8 ≤ 2× (docs/ai/perf/T-070.md)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — terverifikasi: pivotFiltersSchema strict (enum peran diperluas, maks. = jumlah peran), body /api/query tetap strict
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa perubahan konfigurasi

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T15:20:38Z (228595 ms)
- Acceptance criteria: 4/5 satisfied
- Commits: 14e93e4, 17cb5cc, 20985af, 4115c8d, 468e913, 52486eb, 60920fa, 693edf2, 6f54377, 864037d, 8ce72cf, a4869d3, a80b5ae, a821c13, c4a56e5, d13f79e, d23d4b2, d76daf2, f9bd2d5
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-code: 0 findings
