---
id: T-f167
title: 'KPI pembanding: opsi bandingkan rentang hari yang sama (mis. 1–13 Nov vs 1–13 Okt) saat periode terakhir belum penuh'
status: in_review
profile: standard
created: "2026-11-13T15:17:48Z"
updated: "2026-11-13T15:25:36Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 57dda7293c4726d34d457b5936f94072a917728e
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T15:22:10Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 221378
    summary: |-
      …ice":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794583501585,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/home/user/data-dashboard/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794583505200,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794583505204,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794583505207,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  253 passed | 3 skipped (256)
            Tests  3388 passed | 29 skipped (3417)
         Start at  15:22:46
         Duration  151.08s (tests 79%, import 18%, transform 3%)

          Isolate  256 workers spawned · ~130ms startup each (spawn + environment, per file)
                   at least ~10.93s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.9 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T15:25:19Z"
    tree: 5472f8959b100a23c6cd373281ceeecf2c7d628d1b5ae03add9f1de9f47942fd
---

## Objective
Widget Angka berpembanding bisa membandingkan periode berjalan dengan rentang hari yang sama di periode pembanding (mis. 1–13 Okt untuk 1–13 Nov), tanpa mengubah bawaan periode penuh.

## Acceptance criteria
- [x] Given widget Angka berpembanding, when pemilik memilih 'Rentang hari yang sama', then periode pembanding dipotong ke jumlah hari yang sama dengan periode berjalan (mis. 1–13 Okt untuk 1–13 Nov; minggu: Senin–hari yang sama; tahun lalu: tanggal yang sama tahun lalu)
- [x] Bawaan tetap 'Periode penuh' (angka widget yang ada tidak berubah); pilihan tersimpan di spec compare (opsional, rollback aman)
- [x] Teks pembanding menyebut rentangnya (mis. 'vs 1–13 Okt 2026'); PDF/ekspor ikut; bulan dengan hari lebih sedikit (31 Mar → 28/29 Feb) dijepit ke akhir bulan
- [x] Uji unit SQL batas periode (DuckDB) untuk bulan/minggu/kuartal/tahun + uji teks; panduan susun-dashboard diperbarui

## Risk
Impact: spec KPI compare (field opsional range), SQL batas periode, teks pembanding, panel Angka, panduan 06. Security (STRIDE): Tampering — nilai range divalidasi zod enum; SQL tanpa input user baru (interval/hari dihitung DuckDB). Rollback: versi lama menolak spec ber-range (zod strict) → widget yang memakai Hari yang sama tampil 'pengaturan tidak valid' sampai dikembalikan ke Periode penuh; bawaan tidak tersimpan. Validation: uji DuckDB bulan/minggu/jepit akhir bulan, uji teks; aitk check.

## Notes
- 2026-11-13T15:17:49Z Dari T-tyb1 (keputusan: bawaan tetap periode penuh + keterangan s.d.). Query: buildPeriodBoundsSql sudah mengembalikan ld (tanggal data terakhir); pe = ps + (ld - cs + 1 hari) dijepit ke akhir periode pembanding.
- 2026-11-13T15:21:26Z Kuartal/tahun memakai rumus yang sama (diuji bulan + minggu di DuckDB). Ekspor KPI tidak punya kolom periode (catatan lama T-tyb1) — tetap di luar cakupan.
- 2026-11-13T15:22:11Z Review: 0 blocking. Low: rollback (sudah di Risk/runbook); ganti ke Per hari menyisakan range tersimpan (tanpa efek); 's.d.' tetap tampil bersama rentang hari.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — tidak tersentuh
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak tersentuh
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak tersentuh
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — endpoint query widget tidak berubah
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — range divalidasi zod enum; SQL tanpa input user baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak tersentuh
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A — tidak tersentuh
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — tidak tersentuh
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak tersentuh
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A — tidak tersentuh
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A — tidak tersentuh
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak tersentuh
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — spec KPI tetap strict + field opsional
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — tidak tersentuh
