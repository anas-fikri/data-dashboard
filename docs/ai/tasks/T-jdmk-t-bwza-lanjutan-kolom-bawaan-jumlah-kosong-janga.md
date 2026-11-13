---
id: T-jdmk
title: 'T-bwza lanjutan: kolom bawaan Jumlah kosong jangan memilih kolom pembanding KPI'
status: in_review
profile: standard
created: "2026-11-11T07:50:33Z"
updated: "2026-11-13T06:56:33Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 434c0b745ad22ff01f6c055b50b932361f51fdb9
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T06:52:49Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 235436
    summary: |-
      …vice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794552967788,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794552969276,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794552969280,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794552969282,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  253 passed | 3 skipped (256)
            Tests  3376 passed | 29 skipped (3405)
         Start at  06:53:38
         Duration  159.34s (tests 84%, import 14%, transform 2%)

          Isolate  256 workers spawned · ~111ms startup each (spawn + environment, per file)
                   at least ~9.39s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.5 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T06:56:18Z"
    tree: b4126e97a97211995cd89515d6dbfdbbe8ddc32479e9011d7617c8a607d94cba
---

## Objective
Merapikan dua temuan Low T-bwza: pemilihan otomatis kolom tidak lagi memilih kolom pembanding KPI, dan kotak cari daftar pilihan tidak membuka keyboard ponsel otomatis.

## Acceptance criteria
- [x] Ganti Nilai pada KPI berpembanding tidak memilih otomatis kolom tanggal pembanding (widget tetap valid)
- [x] Daftar pilihan berkotak cari tidak memfokus kotak cari otomatis di layar sentuh (sama dengan Select biasa)

## Risk
Impact: panel pengaturan widget (pilihan Nilai) dan SearchSelect di layar sentuh. Security: N/A (UI). Rollback: versi sebelumnya. Validation: uji unit measureForChoice; aitk check.

## Notes
- 2026-11-11T07:50:45Z Low review r2 T-bwza (L-b): KPI Jumlah baris + pembanding pada 'Tgl terima', ganti ke Jumlah kosong → measureForChoice (widget-config-model.ts ±117, pilih nullPct > 0) bisa memilih 'Tgl terima' = kolom pembanding → widget langsung INVALID (panel memberi pesan). Lewati kolom pembanding KPI saat memilih otomatis. Juga: belum ada uji untuk kolom absent di daun field terhitung (probe review mengonfirmasi SQL).
- 2026-11-11T08:42:10Z Low review r3 T-bwza (L2): Nilai/Hitung/Ukuran kini 8 pilihan → SearchSelect; di layar sentuh kotak cari langsung fokus (keyboard ponsel terbuka untuk daftar pendek), beda dengan Select biasa yang sengaja tidak memfokus di pointer coarse (select.tsx ±150). Pilihan: samakan cek coarsePointer di search-select.tsx, atau naikkan SEARCH_MIN / kecualikan daftar ukuran.
- 2026-11-13T06:52:12Z Uji kolom absent di daun field terhitung tidak ditambah (sudah dikonfirmasi probe review T-bwza).
- 2026-11-13T06:52:50Z Review: 0 blocking. Low: panah di pemicu (sentuh+keyboard) tidak memindah pilihan; aria-hidden trigger saat VoiceOver iOS perlu cek perangkat; laptop sentuh+mouse kehilangan fokus otomatis (pointer: coarse).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — perubahan UI klien saja (pemilihan kolom bawaan, fokus kotak cari); tanpa data/endpoint baru
