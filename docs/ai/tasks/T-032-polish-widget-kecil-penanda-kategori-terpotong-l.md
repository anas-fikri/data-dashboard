---
id: T-032
title: 'Polish widget kecil: penanda kategori terpotong, legenda pai samping, tab stop legenda'
status: in_review
profile: standard
profile_pinned: true
goal: G-4
depends_on:
  - T-011
created: "2026-10-13T02:41:40Z"
updated: "2026-10-16T19:37:07Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 0d77bf58cbaa4d434fa33508084eb6ff6394418f
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-16T19:26:18Z"
      findings: 0
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-16T19:26:18Z"
      findings: 3
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 42427
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

      {"level":40,"time":1792179403715,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792179403739,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792179403748,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  121 passed (121)
            Tests  1707 passed (1707)
         Start at  02:36:37
         Duration  28.81s (tests 76%, import 18%, transform 6%, worker 1%)

          Isolate  121 workers spawned · ~126ms startup each (spawn + environment, per file)
                   at least ~1.57s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T19:37:07Z"
    tree: 03e2f857d14d4dc8e3ef01a07690ab6357da0a4958f954008e8761b52cc4b984
---

## Objective
Sisa temuan Low/Info verifikasi T-011 yang sengaja ditunda: (1) kartu batang sangat pendek menyembunyikan catatan 'N dari M' — beri lencana kecil 'N/M' di kepala kartu; (2) kartu pai pendek-lebar: legenda di samping donut; (3) region legenda/keterangan pai selalu jadi tab stop walau tidak meluap — jadikan fokus hanya bila meluap; (4) label minggu 'Mg <tanggal>' bisa dibaca 'Minggu' (hari) — ganti ke 'Mgg mulai …' atau sejenis; (5) swatch legenda identik di forced-colors — beri pola/bentuk berbeda; (6) kartu sentuh sempit di mode edit menyisakan ±46 px badan; (7) kunci cache halaman tabel memakai halaman yang diminta (bisa memakai halaman yang dijepit).

## Acceptance criteria
- [ ] Given kartu batang setinggi 2 baris grid dengan kategori terpotong, when dilihat, then pengguna melihat penanda jumlah kategori yang tampil dari total tanpa membuka tabel data
- [ ] Given legenda pai yang tidak meluap, when pengguna menekan Tab, then legenda tidak menjadi tab stop; bila meluap, tetap bisa difokus dan digulir dengan panah
- [ ] Given mode forced-colors, when legenda pai/garis dilihat, then tiap seri bisa dibedakan tanpa warna

## Risk
Impact: tampilan widget grafik layar: (1) chartFit memberi badge 'N/M' ('N+' tanpa total) saat keterangan tidak muat tetapi kategori terpotong (batang/garis), ditampilkan sebagai "N dari M" di kepala kartu hanya bila kartu ≥ 12,5rem (mode edit ≥ 17rem) agar judul tidak terperas; kartu lebih sempit tanpa lencana (tabel data tetap tersedia) karena di badan grafik lencana menimpa label sumbu (review desain r1/r2); title = keterangan lengkap; pembaca layar memakai ringkasan grafik; (2) legenda dan peringatan negatif pai menjadi tab stop hanya bila meluap (useScrollFocus, ResizeObserver); (3) swatch legenda pai berbeda bentuk per warna dan mempertahankan warna di forced-colors. Cetak/PDF: tanpa badge dan tanpa tabindex; bentuk swatch ikut tercetak. Butir objective di luar AC tidak dikerjakan (label 'Mg', kartu sentuh sempit mode edit, kunci cache halaman tabel) — tetap tercatat. Security (STRIDE): tidak ada permukaan baru. Rollback: revert commit. Validation: unit chartFit.badge, render legenda tanpa tabindex awal; e2e chart-polish (lencana N/12, legenda muat tanpa tab stop vs meluap bisa difokus + panah menggulir, forced-colors 6 bentuk berwarna).

## Notes
- 2026-10-13T15:34:02Z Dari review T-019: axe 'region' (moderate, best-practice) pada portal Radix DropdownMenu/Select yang dirender ke <body> di luar landmark — pertimbangkan Portal container di dalam <main> atau wrapper landmark; bukan WCAG AA.
- 2026-10-14T17:24:28Z Dari T-014: Radix Select (src/components/ui/select.tsx) selalu modal dan menyembunyikan halaman dengan aria-hidden saat listbox terbuka → axe aria-hidden-focus (skip link, sidebar, topbar) di /skema, /pemetaan, panel widget, filter. Fokus terkunci di listbox sehingga tidak bisa dijangkau keyboard, tetapi axe tetap melapor. Perlu primitive listbox non-modal untuk seluruh app (T-019 baru menangani satu filter sebagai menu).
- 2026-10-15T18:09:57Z Dari review T-017 R2-D-1: popover Radix yang tingginya dibatasi (scroll internal) memindahkan fokus Tab/Shift+Tab yang berputar dengan preventScroll, sehingga kontrol terfokus bisa di luar pandangan pada layar pendek (640x360@2x, 667x375). Menu ekspor sudah diperbaiki (onFocus → scrollIntoView nearest + scroll-my-3); periksa popover lain (filter/slicer, dsb.) dan pertimbangkan perbaikan sekali di components/ui/popover.tsx.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — perubahan hanya tampilan klien widget grafik (chart-series chartFit.badge, chart-widget legenda/swatch, use-scroll-focus, widget-body/widget-card lencana)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: tidak ada endpoint atau data baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — teks lencana dari angka hitungan klien, dirender React (escape); tidak ada input baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — pengguna kini melihat bahwa kategori terpotong di kartu pendek (sebelumnya tersembunyi); data tidak berubah
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak menyentuh berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru
