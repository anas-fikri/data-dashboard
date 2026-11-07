---
id: T-ykyd
title: 'v1.10.0: tema warna grafik dashboard, arah batang, garis tren'
status: in_review
profile: standard
created: "2026-11-07T16:10:34Z"
updated: "2026-11-07T16:54:35Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: a77fe1b52270ac9fbc7a6643f051af765848c1f9
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-07T16:42:41Z"
      findings: 3
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-07T16:51:36Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-07T16:54:35Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 138914
    summary: |-
      …host":"127.0.0.1","port":41167,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794070413673,"service":"data-dashboard","host":"127.0.0.1","port":45065,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794070413761,"service":"data-dashboard","host":"127.0.0.1","port":45767,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794070413862,"service":"data-dashboard","host":"127.0.0.1","port":36915,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794070414788,"service":"data-dashboard","datasetId":"t072mw6n7b5sds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794070423062,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794070426130,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794070426151,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794070426154,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794070426167,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  237 passed | 1 skipped (238)
            Tests  3171 passed | 10 skipped (3181)
         Start at  16:52:33
         Duration  95.15s (tests 80%, import 16%, transform 3%)

          Isolate  238 workers spawned · ~83ms startup each (spawn + environment, per file)
                   at least ~6.53s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.9.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-07T16:54:09Z"
    tree: fde94fba9bef9c513d0d0667a56a4ac22e50c33d0e9b6e6b3ca1cd8a6eb3dc10
---

## Objective
Warna dashboard mengatur Tema grafik (warna seri semua Batang/Garis/Pai, layar + PDF) selain template warna status, dengan penjelasan bahwa warna status butuh Penilaian warna per widget; Batang punya arah Otomatis/Mendatar/Tegak (otomatis tegak + urut waktu untuk tanggal/periode); Garis tren lurus/rata-rata bergerak di sumbu waktu dengan legenda arah; halaman Yang baru berbahasa awam dengan penanda di kepala halaman. Rilis v1.10.0 tanpa migrasi.

## Acceptance criteria
- [x] Given tema grafik dipilih di Warna dashboard, when grafik Batang/Garis/Pai dirender (layar/PDF), then warna seri + swatch legenda memakai palet tema
- [x] Given panel Warna dashboard dibuka, when dibaca, then menjelaskan warna status hanya untuk widget yang diberi Penilaian warna
- [x] Given batang berdimensi tanggal/periode dengan arah Otomatis, when dirender, then tegak; Mendatar/Tegak manual dihormati
- [x] Given Tren dipilih di Garis/Batang tegak berdimensi waktu, when dirender, then seri tren putus-putus + legenda arah tren

## Risk
Impact: tampilan semua grafik dashboard (warna seri, arah batang, seri tren) di layar dan PDF; skema spec grafik + tampilan terikat + Dashboard.colors bertambah field opsional (tanpa migrasi); kepala halaman + footer (tautan Yang baru). Security (STRIDE): Tampering — palette divalidasi enum di dashboardColorsSchema strict lewat route PATCH yang sama (mutation wrapper: sesi, cek origin, rate limit, canEditWhere); tidak ada input bebas baru (orientation/trend enum). Information disclosure — halaman Yang baru statis di bundel, requireUser. Rollback: image v1.9.0 tanpa membatalkan apa pun; widget ber-arah/ber-tren tampil tidak valid dan tema dashboard kembali bawaan sampai roll-forward (CHANGELOG Notes, runbook §19). Validation: vitest penuh, typecheck, lint, e2e chart-theme (3), shell, widgets/chart-polish/pivot/status-colors/exports/filters, review subagen.

## Notes

- 2026-11-07T16:54:35Z Bukti: e2e chart-theme 4/4 (batang otomatis tegak + manual, tren 'naik 100 per bulan' & rata-rata 3, tema tersimpan + halaman cetak, klik batang tegak → filter Jun 2026 [uji negatif: gagal tanpa perbaikan], Yang baru + titik), widgets 27, chart-polish 9, pivot 11, status-colors 6, exports 8, filters 9, shell 11; vitest penuh hijau (aitk check); review subagen 3 putaran (3 → 1 → 0 blocking).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — batas kepercayaan sama: route API → service canEditWhere → Prisma; data tema bukan data sensitif
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — PATCH /api/dashboards/[id]/colors tetap updateMany + canEditWhere; viewer 403, tanpa akses 404
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — semua field baru enum zod strict (palette, orientation, trend); warna tema statis di CSS, bukan input pengguna
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak disentuh perubahan ini
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — localStorage hanya menyimpan versi terakhir halaman Yang baru yang dibuka (bukan data pribadi)
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: tidak disentuh perubahan ini
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — input API divalidasi skema strict; tidak ada endpoint baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini
