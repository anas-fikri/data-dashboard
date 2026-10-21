---
id: T-ev34
title: 'Perbaiki e2e sharing: urungkan setelah dialog Bagikan menutup kanvas mode edit'
status: done
profile: strict
tags:
  - e2e
created: "2026-10-21T18:24:30Z"
updated: "2026-10-21T21:22:55Z"
closed: "2026-10-21T21:22:55Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: e0ec8e7649c72fc3d704a97b6aacd01ddaba4101
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
      at: "2026-10-21T21:19:10Z"
      findings: 1
    - "n": 2
      by: claude-code
      at: "2026-10-21T21:19:10Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 198767
    summary: |-
      …t":"127.0.0.1","port":39267,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792617706376,"service":"data-dashboard","host":"127.0.0.1","port":39651,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792617706483,"service":"data-dashboard","host":"127.0.0.1","port":33855,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792617706585,"service":"data-dashboard","host":"127.0.0.1","port":39309,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":30,"time":1792617707185,"service":"data-dashboard","datasetId":"t072mvimaqieds000000","msg":"dataset dihapus"}
      {"level":40,"time":1792617718854,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792617731165,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792617731188,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792617731197,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792617731207,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  225 passed | 1 skipped (226)
            Tests  3021 passed | 10 skipped (3031)
         Start at  21:20:11
         Duration  137.53s (tests 83%, import 14%, transform 3%)

          Isolate  226 workers spawned · ~144ms startup each (spawn + environment, per file)
                   at least ~10.68s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.2.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-21T21:22:30Z"
    tree: f9480a784dccb1da9af6a9704d003ab568fcc961a1814b3e4e26f5b69ba807e6
  commits:
    - 0a6567a
    - 21e6bd7
    - 3f0008e
    - 460a7f3
    - 594ca78
    - 62dfa2b
    - bb53812
    - c7bb4f1
    - ccb8465
    - e0ec8e7
    - e435538
    - eb97953
    - ee2a976
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-21T21:22:31Z"
    passed: true
    tree: f9480a784dccb1da9af6a9704d003ab568fcc961a1814b3e4e26f5b69ba807e6
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 528 dirs visited, 5237 inodes visited, 1 Extract calls, 224.809639ms elapsed, 224.809921ms wall time
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
---

## Objective
Ditemukan saat T-074: tests/e2e/sharing.spec.ts:1849 ('peringatan kolom filter … #kolom-filter', bagian Ctrl+Z di dialog Bagikan) gagal deterministik di HEAD 1ad5b22 tanpa perubahan T-074 (diverifikasi dengan git stash, 2/2 run): setelah closeShare halaman berada di /dashboards (daftar) sehingga widget 'Urungkan nanti' tidak ditemukan. Cari apakah aplikasi bernavigasi (mis. Escape/Back, refresh akses) atau tesnya salah; perbaiki akarnya.

## Acceptance criteria
- [x] Given --project=sharing dijalankan dua kali berturut-turut, then semua tes lulus tanpa waitForTimeout baru

## Risk
Impact: penanganan Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z di kanvas mode edit — di luar kolom teks bawaan
peramban kini dicegah; urungkan kanvas dan urungkan di dalam kolom teks tidak berubah.
Security (STRIDE): T (tampering) — mencegah perubahan data (judul widget) yang tidak disengaja; tanpa
perubahan otorisasi/server.
Rollback: revert commit perbaikan (dashboard-canvas.tsx + uji).
Validation: uji unit tests/components/native-undo-guard.test.ts; e2e --project=sharing dua kali berturut-turut.

## Notes
- Diagnosis T-075 (2026-10-21, belum diperbaiki): direproduksi (--project=sharing, 25 lulus, 1 gagal di
  :1849). Halaman TIDAK bernavigasi ke /dashboards — snapshot error-context diambil dari halaman lain di
  konteks (tes memakai halaman bersama `a`, bukan fixture `page`). Trace jaringan: tepat saat "Bagikan"
  diklik dengan panel widget baru "Urungkan nanti" masih terbuka, klien mengirim
  PATCH /api/dashboards/<d>/widgets/<w> {"title":""} (sesudah PATCH judul "Urungkan nanti" dan PATCH
  type) → judul widget terhapus, jadi widgetTitled(...) = 0. Satu-satunya pengirim judul adalah
  WidgetPanel.saveTitle (onBlur input Judul); state `title` panel bernilai "" saat blur — kemungkinan panel
  dipasang ulang dengan props widget basi (judul "") lalu input kehilangan fokus. Ini bug kehilangan data
  (judul) di aplikasi, bukan hanya tes. Langkah berikut: reproduksi dengan tes kecil (tambah widget, isi
  judul + Enter, pilih jenis, klik Bagikan, cek PATCH), cari pemicu pasang ulang (AccessRefreshProvider
  stateKey / refresh setelah aksi server listShares) dan buat saveTitle hanya mengirim bila input pernah
  diubah pengguna sejak pasang.
- Akar masalah (T-ev34, 2026-10-21): panel TIDAK dipasang ulang. Log konsol di trace: input Judul menerima
  onChange "" tepat saat tes menekan Ctrl+Z dengan fokus di Select peran dialog Bagikan. Urungkan BAWAAN
  Chrome berlaku untuk seluruh dokumen, jadi mengurungkan ketikan (fill) di kolom Judul yang tidak
  difokus → kolom kosong, fokus berpindah ke sana, FocusScope Radix mengembalikan fokus ke dialog → blur
  → saveTitle mengirim {"title":""}. Ini bug kehilangan data nyata (pengguna menekan Ctrl+Z di dialog
  atau di tombol kanvas saat kanvas tidak punya langkah urungkan).
- Perbaikan: isStrayNativeUndo (dashboard-canvas.tsx) — Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z yang
  targetnya bukan kolom teks (input teks, textarea, contenteditable) dicegah bawaannya di pendengar
  keydown kanvas mode edit; urungkan kanvas tetap lewat isCanvasUndo. Judul kosong tetap nilai sah
  ("Widget tanpa judul") jadi server tidak diubah; tes sharing :1849 tidak diubah (sudah menguji ini).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Terverifikasi: urungkan bawaan peramban di luar kolom teks tidak lagi bisa mengosongkan judul widget diam-diam (uji unit native-undo-guard + e2e sharing :1849).
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: hanya penanganan tombol keyboard di klien (mencegah urungkan bawaan peramban); tidak ada input, data, endpoint, atau konfigurasi baru.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-21T21:22:30Z (198767 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 0a6567a, 21e6bd7, 3f0008e, 460a7f3, 594ca78, 62dfa2b, bb53812, c7bb4f1, ccb8465, e0ec8e7, e435538, eb97953, ee2a976
- Review pass 1 by claude-reviewer-subagent: 1 findings
- Review pass 2 by claude-code: 0 findings
