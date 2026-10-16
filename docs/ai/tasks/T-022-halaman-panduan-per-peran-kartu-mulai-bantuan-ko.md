---
id: T-022
title: Halaman /panduan per peran, kartu mulai, bantuan kontekstual
status: in_review
profile: standard
goal: G-4
depends_on:
  - T-021
  - T-016
  - T-008
created: "2026-10-11T14:45:09Z"
updated: "2026-10-16T23:14:23Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: f423ad55faf7dc0cfefe444768ba02d7db3b2004
review:
  passes:
    - "n": 1
      by: frontend-expert-design-reviewer
      at: "2026-10-16T22:30:56Z"
      findings: 2
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-16T23:14:23Z"
      findings: 1
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 45275
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

      {"level":40,"time":1792192428113,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792192428140,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792192428148,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  125 passed (125)
            Tests  1727 passed (1727)
         Start at  06:13:41
         Duration  30.78s (tests 76%, import 17%, transform 6%, worker 1%)

          Isolate  125 workers spawned · ~138ms startup each (spawn + environment, per file)
                   at least ~1.78s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T23:14:13Z"
    tree: 02a6184d163cf7cfbc2dfc274246a2fd133678f76079e65e112ee2f67cc7b6f7
---

## Objective
/panduan: tab per peran turunan user (admin = isAdmin; owner = punya dataset atau user baru; editor/viewer = share) + role all; daftar artikel published berurutan; render markdown tersanitasi; video; pencarian judul/isi. Kartu 'Mulai di sini' di beranda untuk user baru, hilang setelah artikel pertama ditandai dibaca (GuideRead per user). Tombol bantuan di halaman upload/skema/builder membuka panel samping artikel dengan contextKey cocok.

## Acceptance criteria
- [ ] Given user hanya viewer di satu dashboard, when membuka /panduan, then hanya artikel role viewer dan all tampil; slug artikel role owner menjawab 404
- [ ] Given user baru tanpa dataset dan share, when login pertama, then tab owner dan all tampil dan kartu 'Mulai di sini' muncul; setelah satu artikel ditandai dibaca, kartu hilang
- [ ] Given user di halaman skema, when menekan tombol bantuan, then panel samping menampilkan artikel contextKey schema untuk perannya tanpa meninggalkan halaman
- [ ] Given pencarian 'upload', when dikirim, then hasil hanya artikel yang boleh dilihat user dan mengandung kata itu
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
Impact: tabel baru GuideRead (migrasi t022_guide_reads, cascade dari User/GuideArticle); /panduan kini daftar kartu per tab peran + cari (?peran=, ?q=), isi artikel pindah ke /panduan/[slug] (+ tombol Tandai sudah dibaca, Server Action markGuideReadAction); kartu Mulai di sini di Beranda; tombol Bantuan + panel samping di halaman dataset (UPLOAD), skema (SCHEMA), dashboard bagi yang bisa mengedit (BUILDER); GuideMarkdown headingOffset 1|2|3; skrip dev-share-fixture (dataset+dashboard+share uji). Security (STRIDE): Info disclosure/EoP — peran diturunkan server dari data (isAdmin, dataset milik, share eksplisit), bukan dari parameter; semua query pembaca memakai filter PUBLISHED + peran user + ALL (daftar, cari, slug, bantuan, kartu); slug di luar peran → 404; markRead hanya untuk artikel yang boleh dilihat (selain itu NOT_FOUND); pencarian: panjang 2..100, wildcard LIKE di-escape, ≤ 50 hasil; Tampering — tidak ada input yang mengubah peran. Rollback: revert commit + migrasi turun (drop GuideRead); /panduan kembali menampilkan artikel penuh. Validation: e2e guide-roles (viewer: tab Viewer+Umum, artikel pemilik tak tampil + slug 404; user baru: tab Pemilik data+Umum, kartu Mulai di sini hilang setelah tandai dibaca; skema: panel Bantuan hanya artikel konteks skema untuk perannya, URL tetap, Esc kembali ke tombol; cari 'upload' sesuai peran, '%%' bukan wildcard); e2e guides 5/5 + guide-videos 5/5 disesuaikan; unit excerpt; mutasi filter peran membuat uji gagal.

## Notes
- 2026-10-11T14:49:26Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z Sanitasi markdown sama dengan T-020; pencarian isi memakai parameter binding.
