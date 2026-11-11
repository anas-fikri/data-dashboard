---
id: T-bwza
title: 'Ukuran Jumlah kosong (COUNTBLANK): hitung baris yang kolomnya tidak terisi'
status: in_review
profile: strict
created: "2026-11-11T06:12:26Z"
updated: "2026-11-11T08:42:12Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 06f26ffd5a819da4a20a1e24ed13a263c5ec7dcb
paths:
  - CHANGELOG.md
  - content/panduan/06-susun-dashboard.md
  - docs/runbook-deploy.md
  - src/components/dashboards/calc-editor-model.ts
  - src/components/dashboards/config-sections.tsx
  - src/components/dashboards/kpi-compare-fields.tsx
  - src/components/dashboards/widget-config-model.ts
  - src/components/dashboards/widget-config.tsx
  - src/components/widgets/chart-series.ts
  - src/components/widgets/chart-widget.tsx
  - src/components/widgets/drill-dialog.tsx
  - src/components/widgets/kpi-view.tsx
  - src/features/query/service.ts
  - src/features/query/spec.ts
  - src/features/query/sql.ts
  - src/features/query/widget.ts
  - src/features/whats-new/entries.ts
  - src/features/widgets/calc.ts
  - src/features/widgets/spec.ts
  - tests/components/calc-editor.test.ts
  - tests/components/kpi-compare.test.ts
  - tests/components/widget-config.test.ts
  - tests/e2e/filters.spec.ts
  - tests/e2e/widgets.spec.ts
  - tests/features/query/count-blank.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-11T07:46:41Z"
      findings: 5
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-11T07:50:33Z"
      findings: 3
    - "n": 3
      by: claude-reviewer-subagent
      at: "2026-11-11T08:42:12Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 185315
    summary: |-
      …t":"127.0.0.1","port":40461,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794386244619,"service":"data-dashboard","host":"127.0.0.1","port":40855,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1794386244727,"service":"data-dashboard","host":"127.0.0.1","port":34323,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1794386244828,"service":"data-dashboard","host":"127.0.0.1","port":45665,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1794386246641,"service":"data-dashboard","datasetId":"t072mwbv8oefds000000","msg":"dataset dihapus"}
      {"level":40,"time":1794386257283,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1794386263430,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1794386263451,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794386263455,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794386263477,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  246 passed | 1 skipped (247)
            Tests  3295 passed | 10 skipped (3305)
         Start at  08:35:57
         Duration  126.81s (tests 80%, import 17%, transform 3%)

          Isolate  247 workers spawned · ~109ms startup each (spawn + environment, per file)
                   at least ~8.90s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.16.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-11T08:38:05Z"
    tree: c742ba48667a709b4292a2b648c2ad36cd25efa4cf5d74fccc9df870a7584cad
  commits:
    - 06f26ff
    - 1146ff1
    - 1f34fb1
    - 3b06bc5
    - 4084a12
    - 5b25e15
    - 669a30f
    - 6b5c285
    - 84ba18e
    - 973f5ad
    - be7c569
    - e9978ed
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-11T08:31:20Z"
    passed: true
    tree: c742ba48667a709b4292a2b648c2ad36cd25efa4cf5d74fccc9df870a7584cad
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 837 packages
          End status: 542 dirs visited, 4068 inodes visited, 1 Extract calls, 83.064773ms elapsed, 83.064996ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.16.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Nilai baru "Jumlah kosong" (agg `count_blank`, COUNTBLANK = COUNT(*) − COUNT(kolom)) agar pemilik bisa langsung
menghitung baris yang kolomnya belum terisi (resi belum POD, kiriman tanpa kurir, alamat tidak lengkap) di widget
Angka/Batang/Garis/Pai/Tabel ringkas/Pivot dan field terhitung, lengkap dengan pembanding KPI dan klik-tembus ke
baris yang kosong. Tanpa migrasi (v1.17.0).

## Acceptance criteria
- [x] Nilai 'Jumlah kosong' (agg count_blank = COUNT(*) − COUNT(kolom)) di semua widget yang punya Nilai (Angka, Batang, Garis, Pai, Tabel ringkas, Pivot) + label panel/ekspor/PDF; bisa dijumlahkan (Total pivot, Lainnya pai, field terhitung)
- [x] Kosong = sel kosong/hanya spasi (sudah NULL sejak ingest); kolom yang tidak ada di versi data (absent) tampil '(kosong)', bukan jumlah semua baris
- [x] Pembanding KPI dan klik-tembus bekerja untuk Jumlah kosong; klik-tembus dari ukuran ini bisa membuka baris yang kolomnya kosong
- [x] Panduan 06 + Yang baru; tanpa migrasi; rollback image ke versi tanpa count_blank dicatat di CHANGELOG/runbook

## Risk
Impact: daftar agregasi query (spec.ts AGGS/AGG_TYPES/label, sql.ts measureExpr + total pai), spec widget
(AGGS, PIE_AGGS), field terhitung (CALC_AGGS, aditif), panel (opsi Nilai), KPI/grafik (0 bila tidak ada baris),
klik-tembus (klausa kolom kosong). Spec lama tidak berubah arti.
Security (STRIDE): Tampering — agregasi divalidasi zod enum di spec widget dan spec query; tidak ada input bebas ke
SQL (ekspresi tetap, kolom lewat ident()). Info disclosure: klik-tembus tetap hanya kolom drill widget (D6).
Rollback: image ke v1.16.0 → widget ber-Jumlah kosong "Pengaturan widget tidak valid" sampai roll-forward.
Validation: vitest count-blank (KPI, pembanding, batang, pai + total, pivot + total + field terhitung, klik-tembus),
uji panel; e2e widgets T-bwza.

## Notes
- 2026-11-11T06:12:37Z Permintaan pemilik 2026-11-11: pertimbangkan kebutuhan perhitungan baris yang kolomnya tidak terisi. Saat ini: Jumlah baris (COUNT *), Jumlah terisi (COUNTA), filter nilai '(kosong)' di slicer/Saring pivot, nullPct di skema. Belum ada COUNTBLANK langsung. Contoh kebutuhan logistik: resi belum POD (tanggal terima kosong), kiriman tanpa kurir, alamat tidak lengkap. Rencana v1.17.0 setelah v1.16.0 ditutup.
- 2026-11-11T06:16:40Z Keputusan pemilik 2026-11-11: v1.16 dulu, Jumlah kosong di v1.17.
- 2026-11-11T07:50:46Z Review 2 putaran (claude-reviewer-subagent): r1 M1 (kolom absent) + M2 (pembanding kolom sama) + 3 Low diperbaiki; r2 0 blokir, L-a/L-c diperbaiki, L-b → T-jdmk.
- 2026-11-11T08:31:19Z e2e penuh per proyek (e9978ed): 38 proyek lulus; filters T-pxnn gagal karena Nilai kini 8 pilihan (SearchSelect) → uji diarahkan ke Format angka + combobox Nilai, proyek filters 10/10 lulus ulang (84ba18e); data-view-a11y AC2 = T-7377 (sudah gagal di main), AC1 lulus terpisah. Firefox/WebKit/PDF tidak tersedia di VM.
- 2026-11-11T08:42:11Z Review 3 putaran (claude-reviewer-subagent): r1 2 Medium + 3 Low diperbaiki; r2 0 blokir, 2 Low diperbaiki + 1 → T-jdmk; r3 0 blokir, L1 (uji Enter pilih hasil cari) diperbaiki di commit ini, L2 (fokus kotak cari di ponsel) → T-jdmk. Sisa temuan untuk task ini: 0 (gerbang review: Low → task lanjutan).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — Batas kepercayaan tetap: spec widget dari DB (pemilik/editor menyimpan lewat API tervalidasi) → widgetPlan di server; klien hanya mengirim widgetId + nilai drill
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak disentuh perubahan ini
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak disentuh perubahan ini
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Tidak ada endpoint baru; jalur /api/query widget tetap memeriksa akses dashboard; klik-tembus tetap hanya kolom drill widget (D6)
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Agregasi count_blank divalidasi zod enum (spec widget dan spec query, strict); SQL tetap ekspresi tetap COUNT(*) − COUNT(ident(kolom)), kolom lewat posisi skema, nilai drill lewat parameter/klausa tervalidasi
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak disentuh perubahan ini
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — Pesan INVALID pembanding berbahasa awam tanpa detail internal
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak disentuh perubahan ini
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak disentuh perubahan ini
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: tidak disentuh perubahan ini
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Pembanding kolom yang dihitung kosongnya ditolak (tidak menampilkan 0 menyesatkan); kolom absent dihitung 0, bukan semua baris
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: tidak disentuh perubahan ini
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — Spec widget/pivot/field terhitung divalidasi server; cache key memuat agregasi dan klausa drill
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak disentuh perubahan ini

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-11T08:38:05Z (185315 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 06f26ff, 1146ff1, 1f34fb1, 3b06bc5, 4084a12, 5b25e15, 669a30f, 6b5c285, 84ba18e, 973f5ad, be7c569, e9978ed
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-reviewer-subagent: 3 findings
