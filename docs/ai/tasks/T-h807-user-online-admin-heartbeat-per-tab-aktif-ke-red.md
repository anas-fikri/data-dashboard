---
id: T-h807
title: 'User online (admin): heartbeat per tab aktif ke Redis, jumlah online di kartu Server (admin) + daftar di Admin › Penggu…'
status: done
profile: strict
profile_pinned: true
created: "2026-11-17T12:46:12Z"
updated: "2026-11-17T14:01:20Z"
closed: "2026-11-17T14:01:20Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 6e84221c735fb650970fb63d86441851cf3d1900
paths:
  - CHANGELOG.md
  - content/panduan/06-susun-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - content/panduan/12-admin-email-dan-backup.md
  - docs/runbook-deploy.md
  - package-lock.json
  - package.json
  - prisma/migrations/20261117000000_export_png_html/migration.sql
  - prisma/schema.prisma
  - renderer/render.ts
  - renderer/renderer.ts
  - src/app/(app)/admin/pengguna/page.tsx
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/api/metrics/route.ts
  - src/app/api/presence/route.ts
  - src/components/admin/online-users.tsx
  - src/components/dashboards/dashboard-api.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/dashboard-colors-control.tsx
  - src/components/dashboards/dashboard-pdf-export.tsx
  - src/components/dashboards/filter-columns-settings.tsx
  - src/components/dashboards/filter-columns-store.ts
  - src/components/dashboards/filters/default-filters.tsx
  - src/components/dashboards/filters/filter-bar.tsx
  - src/components/dashboards/filters/filter-context.tsx
  - src/components/metrics/server-card.tsx
  - src/components/shell/app-shell.tsx
  - src/components/shell/presence-beacon.tsx
  - src/components/widgets/dashboard-colors.tsx
  - src/components/widgets/export-menu.tsx
  - src/components/widgets/export-model.ts
  - src/components/widgets/export-status.tsx
  - src/features/auth/rate-limit.ts
  - src/features/dashboards/filter-columns.ts
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - src/features/exports/filename.ts
  - src/features/exports/http.ts
  - src/features/exports/pdf-job.ts
  - src/features/exports/render-session.ts
  - src/features/exports/render-token.ts
  - src/features/exports/renderer-client.ts
  - src/features/exports/repo.ts
  - src/features/exports/schema.ts
  - src/features/exports/service.ts
  - src/features/exports/types.ts
  - src/features/metrics/view.ts
  - src/features/presence/labels.ts
  - src/features/presence/service.ts
  - src/features/presence/store.ts
  - src/features/whats-new/entries.ts
  - src/features/widgets/tone.ts
  - src/lib/api-route.ts
  - src/lib/storage/exports.ts
  - tests/components/filter-columns-multisheet.test.ts
  - tests/components/online-users.test.ts
  - tests/components/pdf-export-ui.test.ts
  - tests/components/server-card.test.ts
  - tests/e2e/chart-theme.spec.ts
  - tests/e2e/exports.spec.ts
  - tests/e2e/kpi-drill.spec.ts
  - tests/e2e/presence.spec.ts
  - tests/e2e/status-colors.spec.ts
  - tests/features/dashboards/filter-columns.test.ts
  - tests/features/exports/pdf-job.test.ts
  - tests/features/exports/render-formats.test.ts
  - tests/features/presence/presence.test.ts
  - tests/features/widgets/tone-schema.test.ts
  - tests/renderer/render.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-17T13:27:13Z"
      findings: 7
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-17T13:36:28Z"
      findings: 4
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-17T13:45:53Z"
      findings: 2
    - "n": 4
      by: claude-reviewer-subagent
      at: "2026-11-17T13:53:45Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 209421
    summary: |-
      …vice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794923822932,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794923826363,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794923826367,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794923826369,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  259 passed | 1 skipped (260)
            Tests  3430 passed | 10 skipped (3440)
         Start at  13:54:52
         Duration  143.44s (tests 80%, import 16%, transform 3%)

          Isolate  260 workers spawned · ~111ms startup each (spawn + environment, per file)
                   at least ~9.47s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.23.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-17T13:57:17Z"
    tree: ad48a245c0820a95d38c45164a0989efdaec97447b8bd6e1bb309b57521f1dae
  commits:
    - "4417829"
    - 6e84221
    - c54344a
    - cc9ca98
    - cdc3e64
    - d458bb6
    - e01b3d1
    - eff56c2
    - f2f6133
  acceptance:
    total: 7
    done: 7
  audit:
    at: "2026-11-17T13:57:17Z"
    passed: true
    tree: ad48a245c0820a95d38c45164a0989efdaec97447b8bd6e1bb309b57521f1dae
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 562 dirs visited, 6555 inodes visited, 1 Extract calls, 135.012999ms elapsed, 135.013174ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.23.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Admin tahu siapa yang sedang memakai aplikasi (opsi A, keputusan pemilik 2026-11-17: khusus admin). Setiap tab aplikasi yang terlihat mengirim heartbeat ringan (POST /api/presence ±60 dtk, hanya saat document.visibilityState = visible, berhenti saat tab disembunyikan/logout). Server mencatat ke Redis (ZSET skor = waktu terakhir aktif + data kecil per user: path halaman terakhir tanpa query string), kedaluwarsa otomatis. "Online" = aktif ≤ 5 menit. Admin melihat jumlahnya di kartu Server sidebar dan daftar lengkap di Admin › Pengguna. Tanpa migrasi, tanpa layanan baru; tidak bergantung pada monitor (METRICS_NODE_URL).

## Acceptance criteria
- [x] Tab aplikasi yang terlihat mengirim heartbeat ±60 dtk (langsung saat tab kembali terlihat), berhenti saat tab tersembunyi; tanpa heartbeat di /render, halaman login/publik, dan mode TV tetap dihitung
- [x] Server mencatat kehadiran di Redis per user dari sesi (bukan dari body): waktu terakhir aktif + path halaman tanpa query string; data lebih dari 24 jam terhapus otomatis; heartbeat ber-rate-limit
- [x] Online = aktif ≤ 5 menit; user nonaktif/dihapus tidak ikut dihitung
- [x] Admin: kartu Server sidebar menampilkan 'N online' (juga saat sidebar diciutkan); non-admin tidak menerima angka ini dari API
- [x] Admin › Pengguna: bagian 'Sedang online' — nama, email, terakhir aktif (relatif + WIB), halaman terakhir (label ramah: Dashboard <nama>, Dataset <nama>, Admin, dst.); kosong → teks jelas; diperbarui otomatis
- [x] Tetap jalan tanpa monitor (METRICS_NODE_URL kosong): daftar Admin › Pengguna tetap tampil walau kartu Server tidak ada
- [x] Uji unit store + route (akses admin saja, path disaring), e2e dua akun; panduan admin + Yang baru diperbarui

## Risk
Impact: satu request kecil per tab terlihat per menit (≈ jumlah user aktif/menit ke Redis; ZADD + SET EX), komponen baru di shell aplikasi, bagian baru di Admin › Pengguna, angka di kartu Server untuk admin. Tanpa migrasi. Security (STRIDE): Information disclosure — data kehadiran (siapa, kapan, halaman) hanya untuk admin (requireAdmin di API daftar; jumlah di /api/metrics hanya dikirim bila isAdmin); path disimpan tanpa query string (?f= bisa berisi nilai filter) dan dipotong; Spoofing — user hanya bisa menandai dirinya sendiri (id dari sesi, bukan body); DoS — rate limit heartbeat per user + body kecil; Repudiation — tidak dicatat ke AuditLog (bukan aksi keamanan). Privasi: data kehadiran dihapus otomatis (buang > 12 jam + TTL 12 jam = paling lama 24 jam), tidak ada riwayat jangka panjang (opsi B tidak dikerjakan). Rollback: image sebelumnya; kunci Redis presence:* kedaluwarsa sendiri. Validation: uji unit store presence (jendela 5 menit, pembersihan, path disaring), uji route (bukan admin → 403, user nonaktif tidak tercatat), e2e: dua akun aktif → admin melihat 2 online, viewer tidak melihat angka/daftar.

## Notes

- 2026-11-17T13:36:34Z Unit presence/server-card/online-users + e2e presence (3) + metrics/admin lulus. Review R1 7 Low, R2 1 Medium + 3 Low — semua diperbaiki.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas: tab browser → POST /api/presence (sesi) → Redis; daftar: admin → GET /api/presence → Redis + Postgres (akun aktif, nama dashboard/dataset)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: autentikasi tidak berubah (requireUser/requireAdmin yang ada)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tanpa token/sesi baru; heartbeat memakai cookie sesi yang ada; 401 → heartbeat berikutnya mencoba lagi (1/menit, tanpa data)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — GET daftar requireAdmin (non-admin 404); angka di /api/metrics hanya bila isAdmin; user hanya menandai dirinya (id dari sesi, bukan body)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — path disaring cleanPath (pathname saja tanpa query/hash, karakter aman, ≤200, bukan /api,/render); body ≤1 KB JSON
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tanpa data rahasia tersimpan
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat → 503 tanpa detail; dicatat di log tanpa data pribadi
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — data kehadiran minimal (waktu + pathname), TTL 24 jam, tanpa riwayat; hanya admin; akun nonaktif tidak ditampilkan
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: lalu lintas internal yang sama
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi atau panggilan jaringan baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — rate limit presence:user 300/10 mnt (lewat batas diabaikan diam-diam); tab tersembunyi tidak mengirim
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tanpa file; path bukan URL (tanpa SSRF)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — POST: origin wajib (rejectCrossOrigin), content-type JSON, body berbatas; GET no-store
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: konfigurasi tidak berubah

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-17T13:57:17Z (209421 ms)
- Acceptance criteria: 7/7 satisfied
- Commits: 4417829, 6e84221, c54344a, cc9ca98, cdc3e64, d458bb6, e01b3d1, eff56c2, f2f6133
- Review pass 1 by claude-reviewer-subagent: 7 findings
- Review pass 2 by claude-reviewer-subagent: 4 findings
- Review pass 3 by claude-reviewer-subagent: 2 findings
- Review pass 4 by claude-reviewer-subagent: 0 findings
