---
id: T-021
title: 'Video panduan: upload, validasi, poster dari browser, streaming'
status: in_progress
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-020
  - T-004
created: "2026-10-11T14:45:09Z"
updated: "2026-10-16T21:33:53Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: aab1818da86ed40fc91314d56151f602ee14076a
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 43118
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

      {"level":40,"time":1792186409386,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792186409409,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792186409417,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  124 passed (124)
            Tests  1723 passed (1723)
         Start at  04:33:22
         Duration  28.95s (tests 76%, import 17%, transform 6%, worker 1%)

          Isolate  124 workers spawned · ~132ms startup each (spawn + environment, per file)
                   at least ~1.68s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T21:33:53Z"
    tree: 3fc3d7193e482e32c26b81584917de3565a42007f57381502e7726bcfe005ac8
---

## Objective
GuideVideo {articleId, title, objectKey, posterKey, durationSec}. Upload multipart B2 untuk mp4/webm ≤ 500 MB; signature dengan offset (mp4 ftyp byte 4–8, webm 1A45DFA3). Durasi dan poster diambil di browser (loadedmetadata + canvas → PNG) lalu diunggah (D12). Pemutar <video> via presigned 1 jam dengan Range.

## Acceptance criteria
- [ ] Given admin memilih mp4 valid, when upload selesai, then durasi tersimpan, poster PNG ada di MinIO, dan video tampil di pratinjau
- [ ] Given file .mkv diganti ekstensi .mp4 atau video > 500 MB, when upload, then ditolak sebelum tersimpan dengan code INVALID_FORMAT / FILE_TOO_LARGE
- [ ] Given user menekan putar dan melompat ke menit ke-5, when video berlanjut, then permintaan ke MinIO menjawab 206 Partial Content tanpa unduh penuh
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given poster PNG dari browser, when diunggah, then lewat Route Handler yang memeriksa signature PNG 8 byte dan ukuran ≤ 2 MB, ContentType ditetapkan server; given file bukan PNG, then INVALID_FORMAT

## Risk
Impact: tabel baru GuideVideo (migrasi t021_guide_videos, cascade dari GuideArticle); Route Handler /api/guides/videos (init), /[id]/parts, /[id]/complete, /[id] (DELETE), /[id]/poster (PNG biner); bagian Video di editor /admin/panduan/[id] dan pemutar di /panduan; mesin unggah multipart klien diekstrak menjadi runMultipart (dipakai unggah dataset — e2e uploads 9/9 tetap lulus); MultipartStorage.create menerima Content-Type dari server; proxyClientMaxBodySize 1 → 3 MB; hapus artikel kini juga menghapus objek video/poster; skrip purge dev ikut menghapus objek video artikel uji. Security (STRIDE): Spoofing/EoP — semua route admin aktif saja (selain itu 404), Origin = APP_URL, rate limit per user; Tampering — signature dibaca server setelah complete (mp4 ftyp, webm EBML+DocType; .mkv ditolak), ukuran part diverifikasi, Content-Type objek dari server, kunci objek pola ketat; Info disclosure — objek privat, presigned GET 1 jam; DoS — ≤ 500 MB per video, ≤ 5 video per artikel, poster ≤ 2 MB dengan baca berbatas, unggahan basi > 24 jam dibuang; Repudiation — AuditLog guide.video.add/delete. Rollback: revert commit + migrasi turun (drop GuideVideo) + hapus prefix guides/ di storage; proxyClientMaxBodySize kembali 1 MB. Validation: unit media (signature mp4/webm/mkv/PNG, batas ukuran, format durasi); e2e guide-videos (unggah mp4 6 menit → durasi 6:00 + poster PNG di storage + video tampil; .mkv→.mp4 ditolak di browser dan server setelah complete, baris hilang; > 500 MB → 413; poster bukan PNG → 422, > 2 MB → 413; non-admin 404; /panduan putar + lompat menit 5 → semua respons storage 206 dengan rentang mulai > 4 MB); e2e guides 5/5, uploads 9/9; mutasi signature/PNG membuat uji gagal.

## Notes
- 2026-10-11T14:49:26Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z ContentType video ditetapkan server saat createMultipartUpload (video/mp4|webm), bukan dari klien.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: browser admin (file video lokal, durasi/poster hasil browser) → Route Handler /api/guides/videos* (penentu: ukuran, signature, PNG) → storage S3 (multipart presigned, endpoint publik D5) → pembaca /panduan (presigned GET 1 jam)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — sesi yang ada (requireUser action: sessionVersion dicek, isAdmin dari DB); tanpa kredensial baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — semua route video: admin aktif saja, selain itu NOT_FOUND/404 tanpa menyentuh data (diuji e2e B → 404 untuk init/parts/complete/delete); Origin wajib sama dengan APP_URL; rate limit per user (uploadInit/uploadSign); pembaca hanya mendapat video artikel terbit yang boleh ia lihat (artikel Admin hanya admin)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — ekstensi .mp4/.webm, ukuran 1..500 MB saat init; signature 64 byte awal dibaca server setelah complete (mp4 ftyp byte 4–8, webm EBML + DocType webm sehingga .mkv ditolak) → gagal: objek + baris dihapus (INVALID_FORMAT); part diverifikasi ukuran (signed Content-Length + ListParts + HeadObject); poster: body ≤ 2 MB (Content-Length + baca berbatas, proxyClientMaxBodySize 3 MB agar tidak terpotong diam-diam), signature PNG 8 byte; judul ≤ 120; durasi diterima hanya 0 < d ≤ 6 jam
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat storage → 503 tanpa detail (detail di log pino dengan videoId); AuditLog guide.video.add/guide.video.delete {videoId}; video ditolak dicatat warn
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — video panduan bukan data pribadi; objek privat di bucket, diakses lewat presigned GET 1 jam
- [x] V9 Communication: TLS for all external traffic; certificates validated — presigned URL ditandatangani endpoint publik (HTTPS di produksi, T-023); CSP media-src/img-src hanya self + origin storage
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru (ffmpeg hanya untuk fixture e2e lokal)
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — ≤ 5 video per artikel; unggahan UPLOADING > 24 jam dibuang (abort multipart) saat init berikutnya; hapus artikel → objek video/poster ikut dihapus; complete idempoten untuk video yang sudah READY
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — Content-Type objek ditetapkan server (video/mp4|webm saat createMultipartUpload, image/png saat PutObject), bukan dari klien; kunci objek dari id server dengan pola ketat guides/videos|posters/<id>; isi tidak pernah dieksekusi/diproses server selain baca 64 byte
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Route Handler JSON ≤ 8 KB (uploadRoute) + poster biner; kode galat HTTP 400/404/409/413/422/429/503
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — proxyClientMaxBodySize 1 → 3 MB (poster ≤ 2 MB tidak terpotong); tanpa env baru
