---
id: T-031
title: 'Kanvas dashboard 768–1023 px: widget tidak menyempit sampai tak terbaca'
status: in_progress
profile: standard
profile_pinned: true
goal: G-4
depends_on:
  - T-011
created: "2026-10-13T01:15:20Z"
updated: "2026-10-16T18:28:44Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 7b59767fd8cf0b33f5c600ab1c479ccc39257080
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 42105
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

      {"level":40,"time":1792175300586,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792175300608,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792175300616,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  120 passed (120)
            Tests  1704 passed (1704)
         Start at  01:28:14
         Duration  28.33s (tests 75%, import 18%, transform 6%, worker 1%)

          Isolate  120 workers spawned · ~128ms startup each (spawn + environment, per file)
                   at least ~1.57s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T18:28:44Z"
    tree: fadec94ef346bfbcf95cdb548b1bf7e2365c7c66436022473f2d3408348f82d7
---

## Objective
Pada lebar 768–1023 px grid 12 kolom di area ±480 px (sidebar tetap tampil) membuat widget MIN_W 2 hanya 66–67 px: judul tinggal satu huruf dan fallback terpotong (verifikasi T-011 putaran 2, Medium). Atur breakpoint grid/sidebar agar widget tetap terbaca tanpa merusak layout yang tersimpan.

## Acceptance criteria
- [ ] Given dashboard dengan widget lebar 2 kolom, when dibuka di layar 768 px dan 1023 px, then setiap widget tampil minimal 160 px lebar dan judulnya terbaca (tidak hanya satu huruf)
- [ ] Given layout tersimpan dari layar ≥ 1024 px, when dibuka di 768 px lalu kembali ke 1440 px, then layout ≥ 1024 px tidak berubah

## Risk
Impact: kanvas dashboard 768–1023 px saja — grid tampilan 6 kolom turunan (tabletLayout: lebar separuh, paling sedikit setengah kanvas, posisi diskalakan, tumpang tindih dipadatkan react-grid-layout) tanpa menyeret/ubah ukuran; tata letak tersimpan tetap 12 kolom dan tidak pernah ditulis dari tampilan ini (posisi/ukuran lewat panel seperti di ponsel). ≥ 1024 px dan < 768 px tidak berubah; PDF memakai halaman cetak sendiri. Security (STRIDE): tidak ada permukaan baru (hanya tampilan klien). Rollback: revert commit dashboard-canvas/layout-ops/use-media-query. Validation: unit tabletLayout; e2e 768/1023 px 6 kartu lebar 2 ≥ 160 px dengan judul utuh, mode edit tanpa PUT layout, kembali ke 1440 px + muat ulang = tata letak sama; dashboards.spec 11/11.

## Notes
- 2026-10-13T02:42:40Z Dari verifikasi T-011 putaran 3–4: judul kartu 2 kolom di mode edit (panel menempel 1280/1440, 1024) kini tetap tampil — ambang di widget-card.tsx: mouse → tombol data disembunyikan < 12rem, pegangan < 10rem, padding rapat < 8rem; sentuh → judul baris sendiri < 10rem, pegangan disembunyikan < 6.5rem; sr-only hanya < 5rem. Saat menata ulang grid 768–1023 px, pertahankan ambang ini.
- 2026-10-13T03:44:55Z Dari T-011 putaran 5: tabel data grafik di kartu 66–67 px (768, 2 kolom) masih memotong nilai ringkas dan header — perlu ambang kartu T-031. Di mode edit tombol data disembunyikan < 12rem (sentuh 14.5rem), jadi baris '+N' daftar peringkat di kartu sempit baru terjangkau di mode lihat.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — perubahan hanya tampilan klien kanvas dashboard (dashboard-canvas.tsx, layout-ops.ts tabletLayout, use-media-query.ts useIsTablet)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: peran dan endpoint tata letak tidak berubah; tampilan tablet tidak memanggil API baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: tidak ada input baru; tata letak server tetap divalidasi saveLayout seperti sebelumnya
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — tata letak ≥ 1024 px tidak pernah ditulis dari tampilan 768–1023 px (drag/resize mati; e2e memastikan tanpa PUT layout)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak menyentuh berkas
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru
