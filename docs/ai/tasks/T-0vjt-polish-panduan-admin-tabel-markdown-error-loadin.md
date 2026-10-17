---
id: T-0vjt
title: 'Polish panduan admin: tabel markdown, error/loading route, audit ubah artikel'
status: in_review
profile: standard
depends_on:
  - T-020
created: "2026-10-16T20:32:43Z"
updated: "2026-10-17T10:36:49Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 45f4cffae917c28c6ca013a552c94d52c4c9e683
review:
  passes:
    - "n": 1
      by: claude-code-reviewer-subagent
      at: "2026-10-17T10:35:19Z"
      findings: 9
    - "n": 2
      by: claude-code-reviewer-subagent
      at: "2026-10-17T10:35:19Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 66979
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

      {"level":40,"time":1792233351952,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792233351992,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792233351997,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792233352005,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792233355879,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  137 passed (137)
            Tests  1792 passed (1792)
         Start at  17:35:39
         Duration  46.84s (tests 72%, import 21%, transform 6%)

          Isolate  137 workers spawned · ~213ms startup each (spawn + environment, per file)
                   at least ~3.03s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-17T10:36:27Z"
    tree: e0914a52e263b126c8edfe1ae754ba0a6ab7004f24eed772bab4a1852f9839a1
  audit:
    at: "2026-10-17T10:36:37Z"
    passed: true
    tree: e0914a52e263b126c8edfe1ae754ba0a6ab7004f24eed772bab4a1852f9839a1
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 821 packages
          End status: 189 dirs visited, 1110 inodes visited, 1 Extract calls, 101.135208ms elapsed, 101.138ms wall time
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
- [x] Given artikel berisi tabel markdown (GFM), when dirender di /panduan dan pratinjau, then tampil sebagai tabel yang bisa digulir keyboard, bukan teks mentah
- [x] Given database tidak terjangkau, when membuka /panduan atau /admin/panduan, then halaman galat dengan tombol Coba lagi tampil (bukan galat global) dan ada status memuat
- [x] Given admin membuat atau mengubah artikel, when tersimpan, then AuditLog mencatat guide.create/guide.update {slug, role}; terbitkan ulang artikel yang sudah terbit tidak menulis baris audit ganda

## Risk
- Impact: render markdown panduan (/panduan/[slug], pratinjau editor) kini mengenali tabel GFM; validasi isi menolak tabel > 8 kolom; /panduan dan /admin/panduan dipindah ke route group (daftar) dengan layout gerbang + loading.tsx, error.tsx per segmen; layout (app) merender shell tanpa user bila pembacaan sesi gagal (galat dilog); createGuide/updateGuide menulis audit; setGuideStatus tidak menulis audit bila status sama. Dua dependensi baru (micromark-extension-gfm-table 2.1.2, mdast-util-gfm-table 2.0.0, dipin).
- Security (STRIDE): Tampering/XSS — HTML mentah tetap dimatikan (juga di sel), sanitizer berjalan sebelum align diubah jadi style; align hanya left/center/right dari baris pemisah, ditulis sebagai objek style React; tag baru hanya table/thead/tbody/tr/th/td (sudah ada di skema bawaan). DoS — batas 8 kolom × LINE_MAX, kasus terburuk 20 ribu karakter ≤ 150 ms. Elevation/Information disclosure — gerbang requireUser/requireAdmin di layout (daftar) berjalan sebelum skeleton dikirim (non-admin /admin/panduan tetap 404, sesi dicabut 307); halaman artikel/editor di luar grup tanpa loading sehingga 404 tetap nyata; shell tanpa user tidak menampilkan navigasi admin. Repudiation — guide.create/guide.update {slug, role} di transaksi yang sama, slug duplikat rollback tanpa audit. Error page tanpa detail galat.
- Rollback: revert commit T-0vjt (halaman kembali ke panduan/page.tsx & admin/panduan/page.tsx; tidak ada migrasi: AuditLog.action kolom String). Artikel yang sudah berisi tabel akan tampil sebagai teks mentah lagi.
- Validation: vitest markdown (struktur tabel, nama region, perataan, tidak ada elemen baru, batas kolom + waktu render), service (audit create/update, rollback slug, tanpa audit ganda), actions, guide-error, app-layout; e2e guides/guide-content/guide-roles 16/16 (tabel bisa difokus + digulir panah, tanpa gulir horizontal halaman di 1280/320, 404/307 tetap); review 2 putaran.

## Notes

- 2026-10-17T10:35:19Z AC2 diverifikasi lewat unit test (fallback layout + komponen galat) dan e2e gerbang 404/307; pemadaman DB sungguhan tidak dijalankan (DB lokal dipakai bersama). Sisa temuan Low → T-fesf.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan tetap: isi artikel (input admin) → validasi zod + guideBodyProblem → remark/rehype-sanitize → React; route group (daftar) menaruh gerbang sesi di layout di atas batas Suspense loading.tsx
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; layout (daftar) memakai requireUser/requireAdmin yang ada
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi; shell tanpa user saat pembacaan sesi gagal tidak membuat/menghapus cookie
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — non-admin /admin/panduan tetap 404 dan sesi dicabut 307 (layout gerbang sebelum skeleton; e2e guides/guide-roles); halaman artikel/editor di luar grup tanpa loading sehingga 404 tidak berubah jadi 200; aksi buat/ubah tetap admin-only (asGuideAdmin)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — HTML mentah tetap dimatikan (remarkNoHtml), sanitize skema GitHub tidak diubah; align hanya left/center/right ditulis sebagai objek style React setelah sanitasi; nama region di-escape React, ≤ 80 karakter; tabel > 8 kolom ditolak saat simpan dan sebelum render
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — error.tsx menampilkan judul + pesan umum + Coba lagi tanpa detail galat; galat sesi di layout dilog (logger.warn) lalu shell dirender dengan hak paling sedikit; galat kontrol Next diteruskan (unstable_rethrow)
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — audit guide.create/guide.update hanya {slug, role}, tanpa isi artikel
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — dua dependensi baru dari ekosistem unified/micromark (dipakai remark-gfm sendiri), versi dipin persis, dirilis > 2 minggu; npm audit + osv-scanner 0 temuan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — audit di transaksi yang sama dengan perubahan (slug duplikat rollback tanpa audit); terbit/tarik ulang tanpa perubahan tidak menulis audit (updateMany where status <> target, aman untuk dua permintaan serentak)
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — DoS render dibatasi: 8 kolom × LINE_MAX 2.000 baris, kasus terburuk 20 ribu karakter ≤ 150 ms
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada endpoint baru; tanda tangan Server Action tidak berubah (actor/ip dari sesi di server)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi/header baru; CSP sudah mengizinkan style inline yang dipakai perataan
