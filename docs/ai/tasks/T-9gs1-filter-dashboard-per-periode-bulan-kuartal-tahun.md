---
id: T-9gs1
title: 'Filter dashboard per periode: bulan, kuartal, tahun tertentu dan periode sebelumnya'
status: in_review
profile: standard
created: "2026-10-19T15:04:40Z"
updated: "2026-10-19T15:27:18Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: b0b99d8ce0b7352b544c8732ecda421f790dc35c
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-19T15:23:59Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-19T15:23:59Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 159282
    summary: |-
      …code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792423534762,"service":"data-dashboard","host":"127.0.0.1","port":60335,"step":"menulis file uji","code":3,"err":"Permission denied","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792423534772,"service":"data-dashboard","host":"127.0.0.1","port":60344,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792423534787,"service":"data-dashboard","host":"127.0.0.1","port":60346,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792423534902,"service":"data-dashboard","host":"127.0.0.1","port":60350,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792423553057,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792423553080,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792423553083,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792423553120,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792423559262,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}

       Test Files  158 passed (158)
            Tests  2046 passed (2046)
         Start at  22:25:06
         Duration  107.08s (tests 76%, import 19%, transform 5%)

          Isolate  158 workers spawned · ~468ms startup each (spawn + environment, per file)
                   at least ~7.75s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-19T15:26:56Z"
    tree: 1d46c592d75084e773dddb5742994fa4869e6b603c54e599d67d055be66ccfb3
  audit:
    at: "2026-10-19T15:26:57Z"
    passed: true
    tree: 1d46c592d75084e773dddb5742994fa4869e6b603c54e599d67d055be66ccfb3
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold/package-lock.json file and found 832 packages
          End status: 213 dirs visited, 1438 inodes visited, 1 Extract calls, 197.823459ms elapsed, 197.826ms wall time
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
Pembaca dashboard bisa menyaring kolom tanggal per periode: pilihan cepat bulan/kuartal/tahun berjalan dan sebelumnya serta 30/90 hari terakhir (dihitung server dari tanggal permintaan), atau satu bulan/kuartal/tahun tertentu yang ada di data, dengan chip yang menyebut periodenya dalam bahasa sehari-hari dan bertahan lewat URL, muat ulang, ekspor, dan PDF.

## Acceptance criteria
- [x] Given kolom filter tanggal di dashboard, when pembaca memilih Per periode, then bisa memilih bulan, kuartal, atau tahun tertentu dari periode yang ada di data (mis. Mar 2026, Q1 2026, 2025) dan semua widget yang punya kolom itu tersaring ke rentang periode tersebut
- [x] Given preset tanggal relatif, when dipilih, then tersedia Bulan lalu, Kuartal lalu, Tahun lalu, 30 hari dan 90 hari terakhir di samping bulan/kuartal/tahun berjalan, dihitung dari tanggal permintaan (ekspor dan PDF memakai tanggal permintaan yang sama)
- [x] Given filter periode aktif, when URL dibagikan, dimuat ulang, atau diekspor PDF, then periode tetap sama dan chip filter menyebut periodenya dengan bahasa sehari-hari (mis. Maret 2026, Kuartal 1 2026)

## Risk
- Impact: filter tanggal dashboard mendapat lima preset relatif baru (bulan/kuartal/tahun lalu, 30/90 hari terakhir) dan "Pilih periode" (bulan/kuartal/tahun tertentu dari data) yang dikirim sebagai rentang [awal, awal periode berikutnya) — bentuk yang sudah dipakai filter silang grafik, jadi skema filter/URL/ekspor/PDF tidak berubah selain daftar preset. Endpoint nilai filter mendapat mode months (kolom tanggal). Choice mendapat opsi blankOk (bawaan tidak berubah).
- Security (STRIDE): Tampering — preset baru divalidasi enum zod (klien = server, diuji), bulan dibaca dengan SQL program (strftime/date_trunc) tanpa input user; Information disclosure — mode months melewati otorisasi, cek kolom filter, dan kolom tersembunyi yang sama dengan slicer; DoS — daftar bulan ≤ 1.200 + jatah query/timeout nilai filter yang ada, di-cache dengan kunci terpisah.
- Rollback: revert commit; URL berisi preset baru akan ditolak (diabaikan) oleh kode lama, rentang periode tetap berlaku sebagai rentang tanggal biasa.
- Validation: dashboard-filters.test.ts (aritmetika preset baru: Januari, Q1, kabisat, inklusif), filter-values.test.ts (months terbaru dulu dari DuckDB sungguhan, kolom bukan tanggal INVALID), period-filter.test.ts (opsi bulan/kuartal/tahun, filter + pengenal periode, label chip, daftar preset klien = server); e2e filters.spec.ts (Pilih periode Desember dan Kuartal 4 dari data → KPI tersaring, chip bernama periode, URL rentang, bertahan setelah muat ulang) + seluruh project filters 6/6; tangkapan layar panel 1440/390 ditinjau.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — tidak ada komponen baru: preset dihitung di lapisan filter server yang sama, daftar bulan lewat endpoint nilai filter yang sama (POST /api/dashboards/:id/filter-values)
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — mode months melewati jalur yang sama dengan slicer: dashboard boleh dilihat (filterSource), kolom harus kolom filter dashboard dan tidak disembunyikan; pesan untuk non-pemilik tetap tidak menyebut kolom
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — body strict zod (months: literal true), preset enum klien = server, rentang periode lewat skema range yang ada (tanggal kalender sah); SQL bulan hanya identifier c<pos> + fungsi tetap
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — kolom bukan tanggal → INVALID dengan pesan jelas; gagal memuat daftar bulan hanya menyembunyikan bagian Pilih periode (preset dan rentang sendiri tetap); kata cari/nilai tidak dicatat
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — daftar bulan hanya YYYY-MM (tanpa baris data); cache kunci terpisah dari nilai slicer
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — preset relatif dihitung server dari tanggal permintaan Asia/Jakarta (ekspor/PDF memakai requestedAt yang sama); periode = rentang setengah terbuka yang benar untuk DATE maupun TIMESTAMP
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — tidak ada berkas baru; query bulan dibatasi 1.200 baris + timeout nilai filter
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — satu field opsional baru di body filter-values (strict), jawaban berbentuk sama ({ok, type, values, truncated})
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa konfigurasi baru; npm audit 0 kerentanan
