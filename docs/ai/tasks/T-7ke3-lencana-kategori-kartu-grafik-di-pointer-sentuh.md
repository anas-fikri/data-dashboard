---
id: T-7ke3
title: Lencana kategori kartu grafik di pointer sentuh dan angka panjang tetap menyisakan judul ≥ 4rem
status: in_review
profile: standard
depends_on:
  - T-2nkx
created: "2026-10-17T07:37:32Z"
updated: "2026-10-17T10:39:15Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 3586aaba1a8936da8ce695ae62cf8cbfd5564f67
review:
  passes:
    - "n": 1
      by: frontend-expert-design-reviewer
      at: "2026-10-17T10:37:19Z"
      findings: 5
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-17T10:37:19Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 75338
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

      {"level":40,"time":1792233490378,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792233490400,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792233490402,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792233490408,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792233495401,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  137 passed (137)
            Tests  1792 passed (1792)
         Start at  17:37:55
         Duration  51.56s (tests 73%, import 20%, transform 6%)

          Isolate  137 workers spawned · ~244ms startup each (spawn + environment, per file)
                   at least ~3.47s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T10:38:49Z"
    tree: e0914a52e263b126c8edfe1ae754ba0a6ab7004f24eed772bab4a1852f9839a1
  audit:
    at: "2026-10-17T10:39:03Z"
    passed: true
    tree: e0914a52e263b126c8edfe1ae754ba0a6ab7004f24eed772bab4a1852f9839a1
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 821 packages
          End status: 189 dirs visited, 1112 inodes visited, 1 Extract calls, 91.199917ms elapsed, 91.202ms wall time
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
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given pointer sentuh (tombol kepala 44 px) dan kartu grafik dengan lencana 'N dari M', when lebar kartu di sekitar ambang T-032, then judul tetap ≥ 4rem (lencana tampil hanya bila muat, mis. diukur dari kepala kartu)
- [x] Given lencana terpanjang ('9.999 dari 9.999', '1.000 teratas'), when kartu di batas bawah pitanya, then judul tetap ≥ 4rem

## Risk
- Impact: kepala kartu grafik di dashboard (lihat/edit, pointer halus dan sentuh): lencana kategori "N dari M" / ringkas dipilih dari ruang kepala yang diukur (ResizeObserver + rAF), bukan ambang lebar kartu tetap. Hanya tampilan klien; query, data, dan izin tidak berubah.
- Security (STRIDE): N/A untuk sebagian besar — tidak ada input baru, endpoint, atau data yang ditampilkan; teks lencana berasal dari angka hasil hitung dan dirender React (escape otomatis); span ukur aria-hidden + invisible (tidak masuk pohon aksesibilitas). DoS klien: pengukuran ±10 µs per kartu, efek tidak lagi berlangganan ulang tiap render (dependensi primitif).
- Rollback: revert commit T-7ke3 → kembali ke ambang lebar kartu T-2nkx (judul bisa < 4rem di pointer sentuh).
- Validation: vitest badge-fit (batas penuh/ringkas/tanpa, lencana terpanjang, pembulatan pecahan ke arah aman); e2e chart-polish 7/7 (sweep 1024–1600 px lihat/edit dengan reduced motion, sentuh sungguhan, tombol kepala 44 px dengan kontrol positif penuh/ringkas/ditahan); design review 2 putaran (5 → 0), sweep 2 px reviewer: judul tersempit 64,05 px.

## Notes
