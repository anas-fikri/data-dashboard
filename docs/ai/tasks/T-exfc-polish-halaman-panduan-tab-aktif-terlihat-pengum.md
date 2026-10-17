---
id: T-exfc
title: 'Polish halaman Panduan: tab aktif terlihat, pengumuman hasil, kartu Mulai di sini'
status: in_review
profile: standard
depends_on:
  - T-022
created: "2026-10-16T23:14:23Z"
updated: "2026-10-17T09:37:28Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: f08df61cb13387c5eef86c530e857e1ddff1c975
review:
  passes:
    - "n": 1
      by: frontend-design-reviewer
      at: "2026-10-17T09:37:27Z"
      findings: 0
    - "n": 2
      by: frontend-design-reviewer-confirm
      at: "2026-10-17T09:37:27Z"
      findings: 1
    - "n": 3
      by: claude-code
      at: "2026-10-17T09:37:27Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 80719
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

      {"level":40,"time":1792229786369,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792229786393,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792229786395,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792229786402,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  130 passed (130)
            Tests  1757 passed (1757)
         Start at  16:36:07
         Duration  55.82s (tests 72%, import 21%, transform 6%)

          Isolate  130 workers spawned · ~284ms startup each (spawn + environment, per file)
                   at least ~3.82s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T09:37:05Z"
    tree: 5b1bb4da89ca95de56a253686b104576bcfd4f93327b9c7a189f4d85b10bef26
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given 5 tab peran di layar 320 px, when halaman dibuka, then tab aktif tergulir ke dalam layar; jumlah hasil pencarian diumumkan ke pembaca layar; perpindahan tab memberi tanda memuat
- [x] Given artikel panjang, when pembaca sampai di akhir, then tombol Tandai sudah dibaca juga tersedia di bawah artikel; fokus tidak jatuh ke halaman saat tombol menunggu
- [x] Given admin atau pemilik lama yang sudah memakai aplikasi, when membuka Beranda, then kartu Mulai di sini hanya tampil untuk pengguna yang benar-benar baru (keputusan produk), dan kepala halaman tanpa artikel bantuan tidak merender wadah aksi kosong

## Risk
Impact: halaman Panduan (tab peran: tab aktif tergulir ke layar, tanda memuat saat pindah tab, jumlah hasil diumumkan), artikel (tombol "Tandai sudah dibaca" juga di akhir artikel, fokus tidak jatuh saat menunggu), Beranda (kartu "Mulai di sini" hanya untuk pengguna baru: bukan admin, tanpa dataset milik sendiri, belum membaca artikel), PageHeader (wadah aksi kosong disembunyikan), markdown (lompatan tingkat judul dinormalkan), status pencarian memakai kueri bersih. Playwright: guide-roles.spec jadi proyek sendiri setelah e2e.
Security (STRIDE): tidak ada permukaan baru; aturan kartu memakai data milik user sendiri (listDatasets pemilik, GuideRead), kueri pencarian tetap dibersihkan (cleanLine).
Rollback: revert commit; tanpa migrasi.
Validation: unit (aturan isNewcomer, searchQuery/searchStatus, remarkShiftHeadings, Announce, PageHeader, StartHereCard tanpa query bila admin/pemilik, home-page) 754 tes; e2e guides/guide-roles/guide-content 15/15 serial (320 px tab aktif terlihat, pengumuman jumlah hasil, tanda memuat, fokus tombol bawah saat aksi ditahan, kartu hanya untuk user baru); review desain 3 putaran (0 → 1 lint → 0); tangkapan layar 320 px reduced-motion oleh reviewer.

## Notes
- 2026-10-16T23:23:02Z Dari verifikasi T-022 putaran 2 (non-blocking): NB1 — panduan/page.tsx memakai q mentah untuk teks status sementara pencarian memakai q bersih (?q=%00%00 → '0 artikel cocok dengan “”'); pakai cleanLine(one(sp.q), SEARCH_MAX). NB2 — remarkShiftHeadings hanya menormalkan judul teratas; lompatan di dalam isi (## lalu ####) tetap; petakan kedalaman berbeda ke tingkat berurutan.
- 2026-10-17T09:37:28Z AC1: TabStrip menggulir tab aktif ke layar (320 px, e2e), Announce mengisi status tersembunyi dengan jumlah hasil, TabPending (useLinkStatus) memberi garis berdenyut + daftar redup + 'Memuat artikel…' setelah 100 ms. AC2: MarkReadButton kedua di footer artikel; aria-disabled+aria-busy menjaga fokus saat menunggu (e2e menahan aksi 500 ms). AC3: isNewcomer = bukan admin, tanpa dataset milik sendiri, belum membaca artikel; PageHeader empty:hidden. NB1/NB2 dari T-022 juga selesai.
