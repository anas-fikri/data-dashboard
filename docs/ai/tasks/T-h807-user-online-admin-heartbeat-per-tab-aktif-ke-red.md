---
id: T-h807
title: 'User online (admin): heartbeat per tab aktif ke Redis, jumlah online di kartu Server (admin) + daftar di Admin › Penggu…'
status: in_review
profile: strict
profile_pinned: true
created: "2026-11-17T12:46:12Z"
updated: "2026-11-17T13:36:34Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 6e84221c735fb650970fb63d86441851cf3d1900
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
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 205291
    summary: |-
      …vice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794922230998,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794922233783,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794922233788,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794922233791,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  259 passed | 1 skipped (260)
            Tests  3430 passed | 10 skipped (3440)
         Start at  13:28:21
         Duration  139.22s (tests 81%, import 16%, transform 3%)

          Isolate  260 workers spawned · ~106ms startup each (spawn + environment, per file)
                   at least ~9.05s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.23.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-17T13:30:41Z"
    tree: 6a529f66b7e27dc241b36b59e82a5d641995e364a2e32ac93b5ecd1f6c50e4be
  audit:
    at: "2026-11-17T13:30:46Z"
    passed: true
    tree: 6a529f66b7e27dc241b36b59e82a5d641995e364a2e32ac93b5ecd1f6c50e4be
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 562 dirs visited, 6495 inodes visited, 1 Extract calls, 143.80136ms elapsed, 143.801503ms wall time
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
