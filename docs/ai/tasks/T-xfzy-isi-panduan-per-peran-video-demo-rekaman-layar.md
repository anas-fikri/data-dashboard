---
id: T-xfzy
title: Isi panduan per peran + video demo rekaman layar
status: in_review
profile: standard
depends_on:
  - T-022
created: "2026-10-16T22:16:50Z"
updated: "2026-10-17T00:16:27Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 1cee57183c0edf4826be5ef46bd1860e1e34f2c5
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-17T00:16:27Z"
      findings: 8
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 45166
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

      {"level":40,"time":1792196158472,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792196158496,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792196158504,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  126 passed (126)
            Tests  1731 passed (1731)
         Start at  07:15:51
         Duration  30.74s (tests 75%, import 18%, transform 7%, worker 1%)

          Isolate  126 workers spawned · ~141ms startup each (spawn + environment, per file)
                   at least ~1.83s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T00:16:23Z"
    tree: f81b9b1d9c73e65d3b360e94b2041b691d1b88d4ed5cf5f93ca1973564a3c2fb
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given aplikasi baru dipasang, when skrip seed panduan dijalankan (idempoten per slug), then artikel terbit untuk Pemilik data, Editor, Viewer, Admin, dan Umum tersedia dengan isi Bahasa Indonesia dan konteks bantuan unggah/skema/penyusun
- [ ] Given skrip rekam video dijalankan di mesin ini terhadap app yang berjalan, when selesai, then tiap peran punya video walkthrough (webm, takarir langkah di layar, tanpa data pribadi) yang terunggah ke artikelnya dan bisa diputar di /panduan
- [ ] Given pengguna tiap peran membuka /panduan, when memilih tab perannya, then artikel urut sesuai alur kerja dan video tampil dengan durasi + poster

## Risk
Impact: isi awal panduan di repo (content/panduan, 11 artikel: Umum 2, Pemilik data 5, Editor 1, Viewer 1, Admin 2; konteks bantuan unggah/skema/penyusun) + skrip seed-guides.ts (idempoten per slug, --update, --videos manifest) + record-guide-videos.ts (dev saja: akun demo fiktif demo.*@pcpexpress.com, data demo deterministik, 9 webm 1280×720 bertakarir); pengurai frontmatter src/features/guides/content.ts; .gitignore untuk berkas rekaman (webm tidak di-commit; videos.json di-commit). Security (STRIDE): Info disclosure — video/artikel tanpa data pribadi (nama dan data demo fiktif, password demo acak tidak dicetak); Tampering — seed memvalidasi isi dengan skema artikel + batas struktur dan signature video sebelum unggah, Content-Type dari server, kunci objek pola ketat; skrip rekam menolak NODE_ENV=production. Rollback: hapus artikel lewat /admin/panduan (objek video ikut terhapus) atau revert commit (konten di DB tetap sampai dihapus). Validation: unit content (11 berkas lolos skema, slug unik, semua peran + konteks tercakup); e2e guide-content (seed 2× tidak menggandakan, urutan Umum/Pemilik data sesuai alur, viewer tidak melihat artikel pemilik); probe browser video 72 dtk: durasi terbaca, lompat ke detik 60 dalam 84 ms, poster ada, respons storage 206; QA frame tiap video (takarir + kursor terlihat).

## Notes

- 2026-10-16T23:51:53Z Video demo direkam di mesin ini (Playwright, tanpa biaya): 9 webm 1280×720 bertakarir di demo/guide-videos (±18 MB, tidak di-commit) — umum-mengenal 32 dtk, pemilik-unggah 24, pemilik-skema 18, pemilik-dashboard 72, pemilik-bagikan 29, editor-ubah 21, viewer-filter-ekspor 25, admin-pengguna 18, admin-panduan 21; diunggah ke artikelnya lewat seed-guides --videos. DemoDay (narasi suara AI) tidak dipakai: FAL_API_KEY berbayar belum ada + izin Screen Recording/Accessibility belum diberikan; bisa dibuat ulang bernarasi setelah kunci dipasang dan biaya disetujui user. Untuk produksi (T-023): jalankan seed-guides.ts (artikel) dan, dari mesin yang punya berkas rekaman, seed-guides.ts --videos demo/guide-videos.
