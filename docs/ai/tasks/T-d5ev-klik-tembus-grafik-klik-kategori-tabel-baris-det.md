---
id: T-d5ev
title: 'Klik-tembus grafik: klik kategori → tabel baris detail'
status: done
profile: strict
profile_pinned: true
tags:
  - widgets
  - query
created: "2026-11-10T04:16:38Z"
updated: "2026-11-10T05:40:45Z"
closed: "2026-11-10T05:40:45Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 9ee22e233657afaafd0993f8f54a202bc2ccc4a2
paths:
  - CHANGELOG.md
  - content/panduan/06-susun-dashboard.md
  - content/panduan/09-viewer-lihat-filter-ekspor.md
  - docs/runbook-deploy.md
  - playwright.config.ts
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/kpi-compare-fields.tsx
  - src/components/dashboards/status-fields.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/widgets/chart-table.tsx
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/drill-dialog.tsx
  - src/components/widgets/kpi-compare.ts
  - src/components/widgets/kpi-fit.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-query.ts
  - src/features/dashboards/service.ts
  - src/features/exports/sql.ts
  - src/features/query/service.ts
  - src/features/query/spec.ts
  - src/features/query/sql.ts
  - src/features/query/widget.ts
  - src/features/whats-new/entries.ts
  - src/features/widgets/remap.ts
  - src/features/widgets/spec.ts
  - tests/components/drill.test.ts
  - tests/components/kpi-compare.test.ts
  - tests/e2e/kpi-drill.spec.ts
  - tests/features/exports/csv.test.ts
  - tests/features/exports/fixtures.ts
  - tests/features/query/widget-query.test.ts
  - tests/features/widgets/remap.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-10T04:56:43Z"
      findings: 3
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-10T05:01:04Z"
      findings: 1
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-10T05:02:21Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 233109
    summary: |-
      …setId":"t072mwa9atl8ds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794288930601,"service":"data-dashboard","host":"127.0.0.1","port":46027,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794288930659,"service":"data-dashboard","host":"127.0.0.1","port":41345,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794288930762,"service":"data-dashboard","host":"127.0.0.1","port":46499,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794288930872,"service":"data-dashboard","host":"127.0.0.1","port":42463,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794288939301,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794288961288,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794288961311,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794288961315,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794288961342,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  244 passed | 1 skipped (245)
            Tests  3267 passed | 10 skipped (3277)
         Start at  05:33:48
         Duration  146.76s (tests 80%, import 17%, transform 3%)

          Isolate  245 workers spawned · ~126ms startup each (spawn + environment, per file)
                   at least ~10.20s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.14.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-10T05:36:16Z"
    tree: c1529108cfcefd9e03f086c4b0d369be9501480ef939948da8a25fa24bd4c3c3
  commits:
    - 0c43f39
    - 1d723f8
    - 41ef202
    - 5931b03
    - 9ee22e2
    - b81d108
    - cd206e3
    - cf10253
    - e2c8065
    - f8d9189
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-10T05:36:17Z"
    passed: true
    tree: c1529108cfcefd9e03f086c4b0d369be9501480ef939948da8a25fa24bd4c3c3
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 544 dirs visited, 3652 inodes visited, 1 Extract calls, 109.155867ms elapsed, 109.156108ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.14.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Grafik Batang/Garis/Pai bisa diatur "Klik-tembus": klik kategori (atau Enter pada kategori di keyboard) membuka dialog tabel baris data kategori itu — kolom pilihan pemilik/editor, berhalaman, bisa diurutkan, mengikuti filter dashboard — dengan tombol "Saring dashboard dengan ini" bila filter silang aktif. Viewer hanya melihat kolom yang dipilih untuk widget itu (D6).

## Acceptance criteria
- [x] Given grafik Batang/Garis/Pai dengan klik-tembus aktif (kolom detail dipilih), when user mengklik kategori, then dialog menampilkan baris data kategori itu saja (kolom detail, 100 per halaman, urut per kolom), mengikuti filter dashboard yang berlaku
- [x] Given kategori tanggal ber-periode (mis. Per bulan) atau kategori (kosong), when diklik, then baris = rentang periode itu / nilai kosong; irisan 'Lainnya' tidak bisa diklik-tembus
- [x] Given viewer dashboard, when membuka klik-tembus, then hanya kolom detail widget itu yang terbaca; permintaan dengan nilai yang tidak cocok tipe dimensi, widget tanpa klik-tembus, atau kolom detail tersembunyi ditolak
- [x] Given filter silang aktif di widget, when user menekan 'Saring dashboard dengan ini' di dialog, then filter silang diterapkan seperti klik biasa; tanpa klik-tembus, klik tetap langsung menyaring

## Risk
Impact: spec grafik drill {columns} (spec.ts, remap.ts), body /api/query drill {value} (widget.ts widgetBodySchema, drillClause), resolveWidget (service.ts: rencana tabel + klausa kategori), checkConfig (kolom detail tersembunyi ditolak), UI drill-dialog.tsx, chart-widget.tsx, chart-table.tsx, DrillField di config-sections.tsx.
Security (STRIDE): Information disclosure/D6 — viewer hanya mengirim nilai kategori; kolom yang dibaca = drill.columns tersimpan (bagian columnsOf widget, dipilih pemilik/editor, petunjuk panel menyebut terbaca viewer); klausa dibangun server dari dimensi widget sendiri lewat crossFilterFor + columnClause (posisi, bukan nama kiriman klien), di-AND dengan filter dashboard yang tetap melewati disallowedFilter; widget terikat pivot tersimpan tidak bisa klik-tembus; Tampering/Injection — nilai divalidasi zod (teks ≤ 2000, angka finite) lalu dashFilterSchema + columnClause (parameter, identifier c<pos> dari program); nilai beda tipe / tanggal tidak sah → INVALID; cache — klausa kategori ikut kunci resultKey (dash), rencana tabel ≠ rencana grafik; DoS — tabel berhalaman 100 baris, query lewat rate limit RULES.query + antrean DuckDB terbatas per user.
Rollback: image v1.14.0 — grafik ber-drill tampil 'Pengaturan widget tidak valid' (skema strict) sampai roll-forward; data tetap; tanpa migrasi.
Validation: widget-query.test.ts (klik-tembus teks/bulan/(kosong)/filter/penolakan/kolom tersembunyi/urut), remap.test.ts, drill.test.ts, e2e kpi-drill (owner, ponsel + axe, viewer + penolakan API), suite e2e per proyek.

## Notes

- 2026-11-10T05:32:17Z Bukti: tests/features/query/widget-query.test.ts (klik-tembus teks/bulan/(kosong)/filter dashboard/penolakan: tanpa drill, nilai beda tipe, tanggal tidak sah, kolom detail tersembunyi, urut di luar kolom detail), remap.test.ts (kolom detail dipetakan/dibuang tanpa menandai grafik), drill.test.ts (tombol pembuka dialog, drillTableConfig, drillDefaults unik), e2e kpi-drill (Bandung 4 baris kolom pilihan, Esc fokus kembali, Saring/Lepas dari dialog, ponsel 360 px + axe, viewer + penolakan API 400). Suite e2e per proyek lulus kecuali data-view-a11y AC2/AC3 (gagal juga di v1.14 → T-7377) dan period-limits (lulus saat diulang); Firefox/WebKit/pdf tidak tersedia di VM. Review subagen 3 putaran → 0 temuan; Low sisa → T-tyb1.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan: klien hanya mengirim nilai kategori; spec/kolom dari DB widget; resolveWidget memegang aturan D6.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Akses widget lewat authorize widget yang sama dengan /api/query (dashboardAccess per permintaan); kolom terbaca hanya drill.columns widget itu; widget tanpa drill → INVALID; widget terikat ditolak.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Body strict zod (drill.value teks ≤ 2000/angka finite/boolean/null); dashFilterSchema + columnClause memvalidasi tipe/tanggal; SQL berparameter, identifier c<pos> dari program.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Galat INVALID/COLUMN_UNAVAILABLE memakai pesan yang sama dengan jalur widget (forRole: viewer tanpa nama kolom tersembunyi).
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Kolom detail = data yang sudah boleh dilihat (kolom widget, D6) dan dipilih pemilik/editor dengan petunjuk eksplisit; hasil di-cache per kunci spec+filter seperti widget lain (tidak per user, sama dengan widget).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Klausa kategori dari dimensi widget sendiri (bukan filter kiriman klien) sehingga filter silang yang dimatikan tidak membuka kolom lain; urutan hanya kolom detail; halaman ≤ TABLE_PAGE_MAX.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — /api/query tetap cek Origin (isSameOrigin) + rate limit RULES.query per user + batas body (readTextLimited) + antrean DuckDB per user; skema body strict menolak field lain.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-10T05:36:16Z (233109 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 0c43f39, 1d723f8, 41ef202, 5931b03, 9ee22e2, b81d108, cd206e3, cf10253, e2c8065, f8d9189
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-reviewer-subagent: 1 findings
- Review pass 3 by claude-reviewer-subagent: 0 findings
