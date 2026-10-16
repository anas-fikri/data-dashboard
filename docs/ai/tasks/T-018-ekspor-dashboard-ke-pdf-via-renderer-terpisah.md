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
updated: "2026-10-16T01:46:56Z"
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
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 40813
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

      {"level":40,"time":1792115195744,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792115195767,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792115195775,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  117 passed (117)
            Tests  1658 passed (1658)
         Start at  08:46:28
         Duration  26.09s (tests 75%, import 18%, transform 7%, worker 1%)

          Isolate  117 workers spawned · ~143ms startup each (spawn + environment, per file)
                   at least ~1.72s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T01:46:56Z"
    tree: 3ff6c5c3c92f11ce72c65911b5ef136302b58042dd03bd85168b068e4bc6414b
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
- [ ] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change
- [ ] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets
- [ ] V3 Session management: session tokens are random, protected, invalidated on logout and expiry
- [ ] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR)
- [ ] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template)
- [ ] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code
- [ ] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets
- [ ] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable
- [ ] V9 Communication: TLS for all external traffic; certificates validated
- [ ] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted
- [ ] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions)
- [ ] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF
- [ ] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate
- [ ] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date
