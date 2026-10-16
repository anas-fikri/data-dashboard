---
id: T-020
title: Model panduan per peran dan editor admin (artikel markdown)
status: in_review
profile: strict
profile_pinned: true
goal: G-4
tags:
  - security
depends_on:
  - T-019
created: "2026-10-11T14:45:09Z"
updated: "2026-10-16T20:31:54Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: ed0fdcd46e906f825fea221e81dab50ee290a25c
review:
  passes:
    - "n": 1
      by: frontend-expert-design-reviewer
      at: "2026-10-16T20:31:54Z"
      findings: 5
    - "n": 2
      by: claude-verify-workflow
      at: "2026-10-16T20:31:54Z"
      findings: 5
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 42342
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

      {"level":40,"time":1792182676497,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792182676525,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792182676532,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  123 passed (123)
            Tests  1717 passed (1717)
         Start at  03:31:09
         Duration  28.60s (tests 76%, import 17%, transform 6%, worker 1%)

          Isolate  123 workers spawned · ~129ms startup each (spawn + environment, per file)
                   at least ~1.63s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T20:31:39Z"
    tree: 9f73926698251a3f0857432968067cbbe6701e6826615cc1c231e053a361613c
---

## Objective
GuideArticle {role: owner|editor|viewer|admin|all, contextKey?: upload|schema|builder, title, slug, bodyMarkdown, order, status: draft|published}. /admin/panduan: buat, edit dengan pratinjau tersanitasi, urutkan, terbitkan. Hanya isAdmin.

## Acceptance criteria
- [ ] Given admin, when membuat artikel role viewer dengan contextKey schema dan menerbitkannya, then artikel tersimpan published dan muncul di query artikel untuk role viewer
- [ ] Given markdown berisi tag <script>, when pratinjau/render, then tag dihapus dan tidak dieksekusi
- [ ] Given user non-admin, when membuka /admin/panduan atau memanggil Server Action-nya, then 404 / code NOT_FOUND
- [ ] Given dua artikel urutan 1 dan 2, when admin menukar urutan, then urutan baru tersimpan dan hanya artikel published tampil di /panduan
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task
- [ ] Given markdown berisi href javascript:, data:, <iframe>, <object>, <form>, <style>, atau <img src=https://evil.example>, when dirender, then semuanya dihapus; tautan eksternal mendapat rel='noopener noreferrer'; img hanya dari self/storage.<domain>

## Risk
Impact: tabel baru GuideArticle (migrasi t020_guide_articles, enum GuideRole/GuideContext/GuideStatus); halaman /admin/panduan (daftar, baru, ubah) + Server Action admin; /panduan kini menampilkan artikel terbit (penyaringan per peran di T-022); dependensi react-markdown 10.1.0 + rehype-sanitize 6.0.0 (dipin, npm audit 0); penjaga admin currentAdmin/rateLimited dipindah ke src/features/admin/guard.ts (perilaku sama). Security (STRIDE): Tampering/EoP — hanya admin aktif (requireAdmin page/action → 404/NOT_FOUND), rate limit per admin; XSS (Spoofing/Info disclosure) — HTML mentah tidak dirender, rehype-sanitize allowlist, urlTransform (href http/https/mailto/relatif; gambar hanya relatif/origin app+storage), tautan luar rel noopener noreferrer; Repudiation — AuditLog guide.publish/unpublish/delete. Rollback: revert commit + migrasi turun (drop tabel GuideArticle; belum ada data produksi). Validation: unit sanitasi (script, javascript:, data:, iframe/object/form/style, img luar, rel), unit action non-admin NOT_FOUND tanpa service; e2e guides (404 non-admin, pratinjau tersanitasi tanpa skrip berjalan, terbit tampil di /panduan, tukar urutan tersimpan, draf tidak tampil), e2e admin 5/5.

## Notes
- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
- 2026-10-11T14:57:00Z rehype-sanitize schema allowlist; skema URL hanya http/https/mailto/relatif; sanitasi setelah render.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan: admin (penulis markdown) → DB GuideArticle → semua pengguna (pembaca /panduan); markdown dianggap tidak tepercaya dan disanitasi saat dirender (server /panduan dan pratinjau klien memakai komponen yang sama)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — halaman dan aksi memakai sesi yang ada (requireAdmin); tidak ada kredensial baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — requireAdmin(page) → 404 untuk non-admin; Server Action lewat currentAdmin (admin aktif dari DB) → NOT_FOUND tanpa menyentuh data; rate limit per admin (admin:user); diuji unit + e2e
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — zod strict (judul ≤120, slug kebab ≤80 unik, peran/konteks enum, isi ≤50.000); markdown: HTML mentah tidak dirender, rehype-sanitize allowlist, urlTransform href http/https/mailto/relatif dan gambar hanya relatif/origin app+storage, tautan luar rel noopener noreferrer
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat tak terduga → BUSY tanpa detail (detail di log); penolakan akses admin dicatat terbatas (denial-log); AuditLog guide.publish/unpublish/delete {slug, role}
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — artikel panduan bukan data pribadi; tidak ada PII baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru (gambar luar ditolak)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — dependensi baru dipin exact (react-markdown 10.1.0 Maret 2025, rehype-sanitize 6.0.0 2023, umur > 2 minggu); npm audit 0 kerentanan; osv-scanner bersih
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — urutan ditukar dalam transaksi (duplikat ditangani); hanya PUBLISHED yang tampil di /panduan; slug unik (P2002 → SLUG_TAKEN)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: belum ada unggah berkas (video/poster di T-021); gambar hanya dirujuk dari origin yang diizinkan
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Server Action saja (Origin dicek Next); hasil {ok, code, message, fields} tanpa melempar
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — origin gambar dari env APP_URL + S3_PUBLIC_ENDPOINT; CSP aplikasi tetap; tanpa konfigurasi baru
