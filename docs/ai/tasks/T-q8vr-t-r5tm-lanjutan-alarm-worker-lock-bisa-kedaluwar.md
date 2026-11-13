---
id: T-q8vr
title: 'T-r5tm lanjutan: alarm worker — lock bisa kedaluwarsa saat SMTP lambat; worker crash-loop tidak memicu alarm'
status: in_review
profile: standard
created: "2026-11-13T04:44:33Z"
updated: "2026-11-13T05:58:42Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 92ee2167e0c44e5c14ba489fad8cabd1ccf0d87f
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T05:56:00Z"
      findings: 1
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-13T05:56:22Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 215449
    summary: |-
      …1794549499920,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794549499943,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794549499949,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794549499969,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794549510016,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}

       Test Files  252 passed | 3 skipped (255)
            Tests  3370 passed | 29 skipped (3399)
         Start at  05:56:17
         Duration  144.16s (tests 81%, import 16%, transform 2%)

          Isolate  255 workers spawned · ~115ms startup each (spawn + environment, per file)
                   at least ~9.69s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.3 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T05:58:42Z"
    tree: 3037e76eb3f4dbd2f5ffe70d0a1caad80b230abd893e33706dda4097f43c0238
---

## Objective
Alarm worker mati (T-r5tm) tidak mengirim email ganda saat SMTP lambat dan tetap menyala untuk worker yang crash-loop.

## Acceptance criteria
- [x] Status alarm disimpan sebelum email dikirim; email gagal memulihkan status lama — SMTP lambat tidak menghasilkan email ganda antar proses
- [x] Worker crash-loop (hidup sebentar lalu mati lagi) tetap memicu alarm setelah 10 menit; pulih hanya setelah worker hidup stabil 10 menit

## Risk
Impact: hanya logika alarm email di app produksi; email pulih kini tertunda 10 menit (stabil). Security (STRIDE): DoS email — dibatasi status tersimpan sebelum kirim + ulang 6 jam. Rollback: versi sebelumnya (status Redis kompatibel: field upSince diabaikan). Validation: uji unit keputusan termasuk crash-loop; aitk check.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — log tanpa rahasia
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — email hanya ke admin aktif, isi generik
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — email dibatasi status tersimpan sebelum kirim + ulang 6 jam
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — tidak tersentuh (hanya logika alarm email internal)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — tidak tersentuh (hanya logika alarm email internal)
