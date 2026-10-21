---
id: T-hbcp
title: Cegah tabel terikat pivot tersimpan gagal karena total berjalan dan Top N di baris terdalam
status: done
profile: strict
goal: G-7
tags:
  - bug
created: "2026-10-21T19:46:57Z"
updated: "2026-10-21T21:26:45Z"
closed: "2026-10-21T21:26:45Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: ee2a97615c2766c7a7d4fae0cde92acee007b661
paths:
  - deploy/upgrade.sh
  - docs/runbook-deploy.md
  - playwright.config.ts
  - prisma/migrations/20261021170000_t072_saved_pivot/migration.sql
  - prisma/schema.prisma
  - scripts/dev-saved-pivot-fixture.mjs
  - scripts/perf-pivot-advanced.ts
  - scripts/perf.mjs
  - src/app/(app)/dashboards/[id]/page.tsx
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/(app)/datasets/[id]/pivot-tersimpan/[pivotId]/page.tsx
  - src/app/(app)/datasets/[id]/pivot-tersimpan/baru/page.tsx
  - src/components/dashboards/bound-config-model.ts
  - src/components/dashboards/bound-config.tsx
  - src/components/dashboards/calc-editor.tsx
  - src/components/dashboards/config-saves.ts
  - src/components/dashboards/dashboard-api.ts
  - src/components/dashboards/dashboard-canvas.tsx
  - src/components/dashboards/pivot-config.tsx
  - src/components/dashboards/pivot-saved-filters.tsx
  - src/components/dashboards/query-scope.ts
  - src/components/dashboards/use-dashboard-editor.ts
  - src/components/dashboards/widget-card.tsx
  - src/components/dashboards/widget-config.tsx
  - src/components/dashboards/widget-source.tsx
  - src/components/render/print-card.tsx
  - src/components/render/print-pivot.tsx
  - src/components/saved-pivots/saved-pivot-editor.tsx
  - src/components/saved-pivots/saved-pivot-list.tsx
  - src/components/saved-pivots/saved-pivot-page.tsx
  - src/components/ui/page-header.tsx
  - src/components/widgets/absent-note.tsx
  - src/components/widgets/body-state.ts
  - src/components/widgets/kpi-view.tsx
  - src/components/widgets/table-expand.tsx
  - src/components/widgets/widget-body.tsx
  - src/components/widgets/widget-query.ts
  - src/features/audit/service.ts
  - src/features/auth/rate-limit.ts
  - src/features/dashboards/http.ts
  - src/features/dashboards/service.ts
  - src/features/exports/job.ts
  - src/features/exports/schema.ts
  - src/features/exports/service.ts
  - src/features/query/runtime.ts
  - src/features/query/service.ts
  - src/features/query/widget.ts
  - src/features/saved-pivots/actions.ts
  - src/features/saved-pivots/service.ts
  - src/features/versions/activation.ts
  - src/features/widgets/bound.ts
  - tests/components/bound-config.test.ts
  - tests/components/calc-editor.test.ts
  - tests/components/kpi-line-height.test.ts
  - tests/components/native-undo-guard.test.ts
  - tests/components/page-header.test.ts
  - tests/components/pivot-filters.test.ts
  - tests/components/pivot-ui.test.ts
  - tests/components/saved-pivot-ui.test.ts
  - tests/components/widget-absent.test.ts
  - tests/e2e/bound-widgets.spec.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/pivot-lanjutan.spec.ts
  - tests/e2e/saved-pivot-widgets.spec.ts
  - tests/features/dashboards/dashboards.test.ts
  - tests/features/dashboards/http.test.ts
  - tests/features/exports/bound-export.test.ts
  - tests/features/query/__snapshots__/bound-legacy.test.ts.snap
  - tests/features/query/bound-legacy.test.ts
  - tests/features/query/bound-widgets.test.ts
  - tests/features/query/sharing-repo.test.ts
  - tests/features/saved-pivots/actions.test.ts
  - tests/features/saved-pivots/binding.db.test.ts
  - tests/features/saved-pivots/service.db.test.ts
  - tests/features/versions/activation.test.ts
  - tests/features/widgets/bound.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-21T21:23:00Z"
      findings: 0
    - "n": 2
      by: claude-code
      at: "2026-10-21T21:23:00Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 198115
    summary: |-
      …asetId":"t072mvimfmr1ds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792617936316,"service":"data-dashboard","host":"127.0.0.1","port":41741,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792617936373,"service":"data-dashboard","host":"127.0.0.1","port":35875,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792617936475,"service":"data-dashboard","host":"127.0.0.1","port":41413,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792617936582,"service":"data-dashboard","host":"127.0.0.1","port":33383,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792617951777,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792617955003,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792617955026,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792617955031,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792617955044,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3021 passed | 10 skipped (3031)
         Start at  21:24:02
         Duration  135.50s (tests 83%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~141ms startup each (spawn + environment, per file)
                   at least ~10.50s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T21:26:19Z"
    tree: f9480a784dccb1da9af6a9704d003ab568fcc961a1814b3e4e26f5b69ba807e6
  commits:
    - 0a6567a
    - 21e6bd7
    - 3f0008e
    - 460a7f3
    - 5cf7246
    - 62dfa2b
    - ccb8465
    - e0ec8e7
    - e435538
    - eb97953
    - ee2a976
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-21T21:26:20Z"
    passed: true
    tree: f9480a784dccb1da9af6a9704d003ab568fcc961a1814b3e4e26f5b69ba807e6
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5251 inodes visited, 1 Extract calls, 233.827809ms elapsed, 233.828118ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.2.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
  regression_tests:
    - tests/components/kpi-line-height.test.ts
    - tests/components/native-undo-guard.test.ts
    - tests/components/page-header.test.ts
    - tests/components/pivot-ui.test.ts
    - tests/components/widget-absent.test.ts
    - tests/e2e/dashboards.spec.ts
    - tests/e2e/pivot-lanjutan.spec.ts
    - tests/features/query/bound-widgets.test.ts
    - tests/features/widgets/bound.test.ts
---

## Objective
Ditemukan T-075: pivot tersimpan dengan Pisahkan per (kolom pemisah) + Top N pada baris terdalam + nilai Total berjalan/Selisih sah (sumbu = kolom pemisah). Widget tabel terikat membuang kolom pemisah (src/features/widgets/bound.ts effectiveConfig case table) sehingga sumbu pindah ke baris terdalam ber-Top N dan spec efektif ditolak TOP_N_AXIS_TEXT; pengguna melihat 'Pengaturan widget ini tidak cocok lagi dengan sumber datanya. Pilih ulang nilai…' yang tidak bisa diperbaiki dari panel tabel (tabel tidak memilih nilai). Keputusan standar yang aman: di tabel, nilai bercara tampil sumbu (running/diff_prev/pct_diff_prev) ditampilkan sebagai nilai biasa dengan catatan, atau panel pivot tersimpan memperingatkan saat menyimpan; catat pilihan di ADR-0009.

## Acceptance criteria
- [x] Given pivot tersimpan kolom pemisah + Top N baris terdalam + Total berjalan, when widget tabel diikat, then tabel tampil (bukan galat) dengan catatan cara tampil yang tidak berlaku, dan uji unit effectiveConfig

## Risk
Impact: spec efektif widget tabel terikat (features/widgets/bound.ts) hanya untuk kombinasi yang dulu
galat; hasil query mendapat field opsional `ignoredShowAs` (kartu, tabel diperbesar, PDF). Widget lain,
kunci cache widget mandiri, dan pivot tersimpan tidak berubah.
Security (STRIDE): I (information disclosure) — catatan hanya menyebut label cara tampil (sudah tampil
di judul kolom pemilik), tanpa nama/definisi pivot tersimpan; viewer menerima teks yang sama.
Rollback: revert commit T-hbcp (tabel kembali menampilkan galat "Pilih ulang nilai").
Validation: tests/features/widgets/bound.test.ts (T-hbcp), tests/features/query/bound-widgets.test.ts
(pemilik + viewer), tests/components/widget-absent.test.ts; e2e --project=widgets.

## Notes
- Keputusan (ADR-0009, entri T-hbcp): di tabel, Total berjalan/Selisih/% selisih yang sumbunya jatuh ke
  baris terdalam ber-Top N tampil sebagai nilai biasa + catatan "… tidak berlaku di tabel ini (tanpa
  Pisahkan per, baris terdalam memakai Top N): nilainya tampil sebagai nilai biasa." (data-testid
  widget-ignored-show-as di kartu; Note di print-card). Tidak ditolak saat menyimpan pivot tersimpan
  karena definisi itu sah untuk pivot/grafik.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — Terverifikasi: jalur otorisasi widget (runWidgetQuery/forRole) tidak berubah; catatan ikut jawaban yang sudah diotorisasi.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — Terverifikasi: spec efektif tetap divalidasi parseWidgetConfig (zod); tanpa SQL baru; catatan dirender sebagai teks React (ter-encode).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — Terverifikasi: catatan hanya label cara tampil (sudah tampil di judul kolom), tanpa nama/definisi pivot tersimpan; viewer mendapat teks sama (uji bound-widgets).
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: perubahan murni penyusunan spec efektif tabel terikat + catatan tampilan; tidak ada endpoint, input, data sensitif, atau konfigurasi baru.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T21:26:19Z (198115 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 0a6567a, 21e6bd7, 3f0008e, 460a7f3, 5cf7246, 62dfa2b, ccb8465, e0ec8e7, e435538, eb97953, ee2a976
- Review pass 1 by claude-reviewer-subagent: 0 findings
- Review pass 2 by claude-code: 0 findings
