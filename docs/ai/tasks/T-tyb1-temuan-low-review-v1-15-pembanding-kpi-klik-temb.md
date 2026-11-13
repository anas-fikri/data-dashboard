---
id: T-tyb1
title: Temuan Low review v1.15 (pembanding KPI + klik-tembus)
status: in_review
profile: standard
tags:
  - widgets
created: "2026-11-10T04:56:45Z"
updated: "2026-11-13T14:48:48Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: f5246f00ce1bab4a89610c53fe3e2b81575cba7d
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-13T14:45:17Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 219548
    summary: |-
      …e_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at queueWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:102:40)\n    at ingestWorkerCount (/home/user/data-dashboard/src/lib/queue/versions.ts:124:10)\n    at /home/user/data-dashboard/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker gagal dibaca"}
      {"level":40,"time":1794581292740,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794581292762,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794581292765,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794581292777,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794581301691,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794581301695,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}
      {"level":40,"time":1794581301697,"service":"data-dashboard","userId":"slow","err":"timeout","msg":"storage per akun gagal dihitung"}

       Test Files  253 passed | 3 skipped (256)
            Tests  3385 passed | 29 skipped (3414)
         Start at  14:46:03
         Duration  147.16s (tests 80%, import 17%, transform 3%)

          Isolate  256 workers spawned · ~127ms startup each (spawn + environment, per file)
                   at least ~10.67s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.21.8 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-13T14:48:31Z"
    tree: 5e39cf818be4fdd7f1f8f5d4796b2b94493e8ea8412287b20e7f31241dab3f2e
---

## Objective
Sisa temuan Low review v1.15 (subagen, putaran 1) yang tidak memblokir rilis: kolom klik-tembus/pembanding yang disembunyikan setelah disimpan memblokir simpan otomatis widget dengan pesan umum (perlu tombol perbaiki/buang otomatis seperti kolom tabel); petunjuk filter silang dashboard masih 'pilih kategori…' untuk grafik berklik-tembus; panel Angka tidak menyebut bahwa warna ▲/▼ mengikuti penilaian bawaan dashboard; periode terakhir biasanya belum penuh (pertimbangkan catatan 's.d. <tanggal>' atau membandingkan rentang hari yang sama); 3 query pembanding bisa digabung.

## Acceptance criteria
- [x] Given kolom klik-tembus atau kolom tanggal pembanding disembunyikan setelah disimpan, when panel widget dibuka, then ada tindakan perbaikan (buang kolom / matikan) dan simpan otomatis tidak diam-diam terhenti
- [x] Given grafik berklik-tembus, when petunjuk filter silang tampil, then teksnya menyebut klik membuka baris data (dan saring lewat tombol di tabel itu)
- [x] Given Angka berpembanding tanpa penilaian sendiri dan dashboard punya penilaian bawaan, when panel dibuka, then petunjuk menyebut warna ▲/▼ mengikuti penilaian bawaan dashboard
- [x] Given periode terakhir belum penuh, when KPI berpembanding tampil, then label/keterangan menjelaskan rentang yang dibandingkan (keputusan desain dicatat)

## Risk
Impact: panel widget (perbaikan kolom klik-tembus/pembanding, petunjuk warna), petunjuk filter silang, query batas periode KPI (+1 kolom tanggal terakhir), teks pembanding KPI. Security: N/A (tanpa input/endpoint baru). Rollback: versi sebelumnya (field latest opsional). Validation: uji unit widget-config, kpi-compare, widget-query (DuckDB); aitk check.

## Notes
- 2026-11-10T05:01:05Z Dari review v1.15 r2: file ekspor KPI berpembanding belum menyebut periodenya (tambah kolom/label periode).
- 2026-11-13T14:44:39Z Keputusan desain AC4: tetap membandingkan periode pembanding penuh dengan periode berjalan; keterangan 's.d. <tanggal data terakhir>' di baris pembanding + kalimat lengkap (title/pembaca layar). Membandingkan rentang hari yang sama ditunda (mengubah angka yang sudah dipakai pemilik). Catatan ekspor KPI tanpa label periode: tidak dikerjakan (Low).
- 2026-11-13T14:45:18Z Review: 0 blocking. Low: withoutMissingExtras dihitung 2×/render; hasDrill memeriksa semua widget (bukan hanya grafik bersaring silang); tanpa uji unit latest = hari terakhir (diuji di widget-query lewat data 31 Mar).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A — tidak tersentuh
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak tersentuh
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak tersentuh
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — endpoint query widget tetap memeriksa akses seperti sebelumnya
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — SQL batas periode: kolom lewat ident(), tanpa input user baru; teks dirender React
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak tersentuh
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A — tidak tersentuh
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — tidak tersentuh
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak tersentuh
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A — tidak tersentuh
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A — tidak tersentuh
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak tersentuh
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — field latest opsional, bentuk 'YYYY-MM-DD' dari DuckDB
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — tidak tersentuh
