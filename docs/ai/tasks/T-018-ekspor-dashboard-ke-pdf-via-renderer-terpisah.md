---
id: T-018
title: Ekspor dashboard ke PDF via renderer terpisah
status: in_review
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-016
created: "2026-10-11T14:45:09Z"
updated: "2026-10-16T04:48:11Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 2496574ef8c25e79908d5c853085d7b7f22fd9ca
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-15T23:54:44Z"
      findings: 9
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-16T01:45:24Z"
      findings: 1
    - "n": 3
      by: claude-verify-workflow
      at: "2026-10-16T02:05:22Z"
      findings: 3
    - "n": 4
      by: claude-verify-workflow
      at: "2026-10-16T02:52:53Z"
      findings: 5
    - "n": 5
      by: claude-verify-workflow
      at: "2026-10-16T03:40:40Z"
      findings: 3
    - "n": 6
      by: claude-verify-workflow
      at: "2026-10-16T04:30:21Z"
      findings: 4
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 39141
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

      {"level":40,"time":1792126071310,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792126071333,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792126071341,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  117 passed (117)
            Tests  1674 passed (1674)
         Start at  11:47:44
         Duration  25.36s (tests 74%, import 19%, transform 6%, worker 1%)

          Isolate  117 workers spawned · ~138ms startup each (spawn + environment, per file)
                   at least ~1.65s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T04:48:11Z"
    tree: 8a6e3b35b869329e36f81b674fd84013f4a7b61e7d0e6dff8ca9f4dfbac3657d
---

## Objective
Layanan renderer (Chromium/Playwright) terpisah dari app dan worker. App menerbitkan token render sekali pakai 60 detik terikat (dashboardId, userId, filter); renderer membuka /render/<token> yang hanya menerima token itu, mencetak A4 landscape, menyimpan ke exports/, presigned 1 jam.

## Acceptance criteria
- [ ] Given dashboard 6 widget dengan filter aktif, when ekspor PDF, then PDF memuat semua widget dengan nilai sama seperti layar
- [ ] Given token render sudah dipakai atau > 60 detik, when /render/<token> dibuka, then 404
- [ ] Given renderer mati, when user ekspor PDF, then user melihat code RENDERER_UNAVAILABLE dalam ≤ 10 detik, bukan hang
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given permintaan ke renderer tanpa header RENDERER_SECRET yang benar, when dikirim, then ditolak; renderer hanya menerima {token} dan membuka APP_INTERNAL_URL/render/<token> sendiri (tidak menerima URL)
- [ ] Given halaman render mencoba memuat resource di luar origin app, when Chromium meminta, then diblokir oleh route allowlist; Chromium berjalan non-root dengan seccomp profile Playwright

## Risk
Impact: komponen baru renderer (Chromium) + halaman /render publik bertoken + antrean/worker `pdf`; jalur ekspor T-017 diperluas ke format PDF (Export tanpa widget, kunci .pdf, audit dashboard.export). Ketergantungan baru playwright-core (runtime) dan pdfjs-dist (dev). Dokumen flow-kerja/conventions/T-023 diselaraskan (pemanggil = worker, jaringan render).
Security (STRIDE): S — token render acak sekali pakai 60 detik (hash di Redis, GETDEL) ditukar cookie Path=/render sekali pakai; renderer hanya menerima {token} + header RENDERER_SECRET (timingSafeEqual), tidak pernah URL. T — data widget diambil di server lewat resolver yang sama dengan /api/query (D6, filter disanitasi saat buat dan saat render); renderer tidak bisa menulis ke storage (worker yang mengunggah setelah cek %PDF- + batas ukuran). R — AuditLog dashboard.export saat unduh. I — akses dashboard dicek ulang di worker dan halaman render; token tidak pernah memberi akses /api; path /render/<token> diredaksi dari log; CSP /render tanpa upgrade-insecure-requests, Referrer-Policy no-referrer, noindex, no-store. D — rate limit 10/10 menit + maks 2 ekspor berjalan per user, semaphore renderer (503), timeout render 60 s, PDF_MAX_BYTES. E — Chromium non-root + seccomp Playwright + cap_drop ALL + read_only di jaringan internal `render` tanpa egress; allowlist rute hanya origin app, 3xx dan origin lain diblokir (menutup bypass redirect).
Rollback: revert commit T-018; hapus service/jaringan renderer dari compose; antrean `pdf` di Redis boleh dihapus; baris Export PDF lama dibersihkan sapuan ekspor (tidak ada migrasi baru).
Validation: unit (token mint/exchange/consume + kedaluwarsa, klien renderer timeout → RENDERER_UNAVAILABLE, job PDF, pageBands, CSP /render, redaksi log, env refine host HSTS, validasi body/secret/allowlist renderer termasuk 3xx), e2e (AC1 nilai PDF = layar via pdfjs, AC2 token dipakai/kedaluwarsa 404, AC3 renderer mati → RENDERER_UNAVAILABLE ≤ 10 s, AC5 tanpa secret 401 / {url} 400), bukti docker non-root + seccomp (AC6), review adversarial berulang sampai 0 temuan + design-reviewer, next build.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z Token dipindah dari URL ke cookie render-scope pada respons pertama; path /render/* diredaksi dari access log proxy dan pino; renderer hanya di network frontend (tidak bisa mencapai minio/redis/postgres).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan (ADR-0006): POST /api/exports {dashboardId, format pdf, f} (sesi + Origin + rate limit) → tabel Export → antrean BullMQ `pdf` → worker cek akses ulang + cetak token → renderer (jaringan internal `render`, hanya {token} + header secret) → Chromium membuka APP_INTERNAL_URL/render/<token> → cookie sesi render → halaman /render mengambil data di server lewat resolver /api/query → PDF kembali ke worker (cek %PDF- + ukuran) → S3 exports/<userId>/<id>.pdf → presigned 5 menit; data sensitif = nilai widget terfilter, token/sesi render, RENDERER_SECRET
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — route app memakai requireUser (sesi aktif + terverifikasi); renderer menolak tanpa x-renderer-secret yang benar (401, timingSafeEqual atas digest sha256); RENDERER_SECRET ≥ 32 karakter, dicek placeholder, masuk SENSITIVE_VARS, dibangkitkan gen-dev-env (tidak ada secret bawaan/hard-coded)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — token render 32 byte acak (base64url 43), disimpan hanya sebagai sha256 di Redis SET NX PX 60000, GETDEL sekali pakai; ditukar sesi render (sisa TTL) → cookie dd.render HttpOnly SameSite=Strict Path=/render Max-Age ≤ 60 (Secure bila https); halaman /render GETDEL sesi (sekali pakai); HEAD tidak mengonsumsi; token tidak pernah memberi akses /api/* (diuji e2e AC2: dipakai/kedaluwarsa → 404)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — akses dashboard dicek saat buat, di worker, di halaman render (pengguna aktif + akses belum dicabut), saat status dan unduh; ekspor hanya milik pemilik (404 untuk lainnya); viewer/editor/pemilik memakai jalur role-shaped yang sama dengan /api/query (D6 400); render tanpa cookie/pemakaian kedua/user lain → 404 polos
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — body zod strict (dashboardId, format, f ≤ 60 000 karakter); filter disanitasi terhadap kolom filter + cross-filter dashboard saat buat DAN saat render; renderer: content-type JSON, body ≤ 1 KB, {token} strict /^[A-Za-z0-9_-]{43}$/, kunci lain (mis. url) → 400; identifier SQL tetap c<pos>, nilai di-bind; teks PDF dirender React (escape); nama file disanitasi (ASCII + RFC 5987)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — token/sesi render disimpan hanya sebagai sha256 (bukan nilai mentah) dan kedaluwarsa ≤ 60 detik; RENDERER_SECRET hanya dari env, tidak di kode; tidak ada data rahasia baru at rest
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — renderer log hanya {requestId, ms, bytes, outcome}; galat ke user berupa kode (RENDERER_UNAVAILABLE, EXPORT_TIMEOUT, EXPORT_FAILED) tanpa galat mentah Chromium/S3; pino meredaksi /render/<token> di nilai string + kunci token, logger next dev mengabaikan /render/; AuditLog dashboard.export {exportId, format pdf, role} saat unduh
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — objek PDF kedaluwarsa 60 menit lalu dihapus oleh mekanisme T-017 (job + sapuan + lifecycle 1 hari); /render: Cache-Control no-store, Referrer-Policy no-referrer, X-Robots-Tag noindex; presigned 5 menit attachment; renderer tidak punya akses storage/DB/Redis
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru — app ↔ renderer ↔ app hanya di jaringan internal `render` tanpa egress (TLS publik diterminasi reverse proxy, T-023); route allowlist Chromium memblokir origin lain
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — dependensi baru dipin exact: playwright-core 1.64.0 (runtime renderer) dan pdfjs-dist (dev, verifikasi e2e); seccomp profile divendor dari repo Playwright tag v1.64.0 dengan catatan provenans; npm audit 0 kerentanan; Chromium tanpa unduhan (acceptDownloads false), service worker diblokir, websocket hanya dev HMR
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — rate limit ekspor PDF 10/10 menit + maks 2 ekspor berjalan per user (dibagi dengan T-017, advisory lock); token sekali pakai 60 detik (replay → 404); semaphore renderer → 503 dicoba ulang dengan token baru; renderer mati → RENDERER_UNAVAILABLE ≤ 10 detik tanpa retry (precheck /healthz ≤ 3 s di app + probe di worker); timeout render → EXPORT_TIMEOUT; PDF_MAX_BYTES
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — renderer tidak pernah menerima URL (hanya token; membuka APP_INTERNAL_URL sendiri — menutup SSRF); allowlist rute hanya origin app lewat route.fetch maxRedirects 0, 3xx dan origin lain di-abort (fail closed); APP_INTERNAL_URL di-refine (host HSTS-preload ditolak); hapus objek dijaga EXPORT_KEY ^exports/<id>/<id>\.(csv|xlsx|pdf)$ + MIME application/pdf; Chromium non-root (uid 1001) + seccomp Playwright + cap_drop ALL (cap SYS_CHROOT untuk sandbox, ADR-0006) + read_only + no-new-privileges
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — kontrak HTTP POST /api/exports 202/400/404/429/503 + no-store, Origin same-origin; renderer API GET /healthz → {ok:true} saja, POST /render 401/400/404/405/503; status/unduh tidak berubah bentuk (pemilik saja)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — env app (RENDERER_URL/SECRET/RENDER_TIMEOUT_MS/PDF_MAX_BYTES) dan renderer (env zod sendiri, tidak mengimpor src/lib/env.ts) divalidasi; CSP /render per-route tanpa upgrade-insecure-requests dan tanpa origin storage + form-action 'none'; flag dev LNA hanya saat ALLOW_DEV_WEBSOCKET; service compose renderer di profile `renderer` (seccomp + no-new-privileges + cap_drop ALL + read_only + tmpfs + mem_limit); next build produksi diverifikasi saat penutupan
