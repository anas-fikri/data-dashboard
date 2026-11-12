---
id: T-rbrb
title: 'v1.19: mode periode — periode yang sudah ada bisa Ganti / Tambah baris / Perbarui berdasarkan kunci (upsert), bukan han…'
status: in_review
profile: strict
created: "2026-11-11T16:33:38Z"
updated: "2026-11-12T07:21:55Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: 65747109ec59df6b0e53715f3d93fa0a2d258f9e
paths:
  - CHANGELOG.md
  - content/panduan/03-unggah-data.md
  - content/panduan/15-data-per-periode.md
  - docs/catatan-kerja-claude.md
  - docs/runbook-deploy.md
  - package.json
  - playwright.config.ts
  - prisma/migrations/20261112000000_period_keys/migration.sql
  - prisma/schema.prisma
  - scripts/perf-period-ingest.ts
  - src/app/(app)/datasets/[id]/periode/page.tsx
  - src/app/api/uploads/route.ts
  - src/components/datasets/period-keys-form.tsx
  - src/components/datasets/period-list.tsx
  - src/components/datasets/period-review-form.tsx
  - src/components/datasets/upload-panel-state.ts
  - src/components/datasets/upload-panel.tsx
  - src/components/datasets/upload-period-mode.tsx
  - src/components/datasets/upload-queue.tsx
  - src/components/datasets/upload-sheet-picker.tsx
  - src/features/audit/service.ts
  - src/features/ingest/ingest.ts
  - src/features/ingest/merge-sheets.ts
  - src/features/ingest/period-ingest-repo.ts
  - src/features/ingest/period-ingest.ts
  - src/features/ingest/period-key.ts
  - src/features/ingest/period-keymerge.ts
  - src/features/ingest/period-plan.ts
  - src/features/ingest/period-review.ts
  - src/features/ingest/period-upload-plan.ts
  - src/features/uploads/client.ts
  - src/features/uploads/queue-actions.ts
  - src/features/uploads/queue-plan.ts
  - src/features/uploads/queue.ts
  - src/features/uploads/service.ts
  - src/features/versions/actions.ts
  - src/features/versions/period-manage.ts
  - src/features/versions/period-setup.ts
  - src/features/versions/period-upload.ts
  - src/features/whats-new/entries.ts
  - tests/e2e/helpers.ts
  - tests/e2e/ingest.spec.ts
  - tests/e2e/period-keys.spec.ts
  - tests/features/ingest/merge-sheets.test.ts
  - tests/features/ingest/period-ingest.test.ts
  - tests/features/ingest/period-plan.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-11-12T07:02:20Z"
      findings: 13
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-11-12T07:02:21Z"
      findings: 8
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 224433
    summary: |-
      …ime":1794467788313,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1794467788325,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1794467788347,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1794467800497,"service":"data-dashboard","err":{"type":"Error","message":"NOPERM this user has no permissions to run the 'client' command","stack":"Error: NOPERM this user has no permissions to run the 'client' command\n    at Object.<anonymous> (/tmp/claude-0/-home-user-data-dashboard/c4894b2f-b21b-5e0c-b029-c44ab5dcf375/scratchpad/wt20/tests/features/versions/queue-position.test.ts:71:17)\n    at Object.Mock [as getWorkers] (file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/spy.DgMTfhrK.js:323:40)\n    at ingestWorkerCount (/tmp/claude-0/-home-user-data-dashboard/c4894b2f-b21b-5e0c-b029-c44ab5dcf375/scratchpad/wt20/src/lib/queue/versions.ts:100:40)\n    at /tmp/claude-0/-home-user-data-dashboard/c4894b2f-b21b-5e0c-b029-c44ab5dcf375/scratchpad/wt20/tests/features/versions/queue-position.test.ts:69:13\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async file:///home/user/data-dashboard/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2783:20"},"msg":"jumlah worker ingest gagal dibaca"}

       Test Files  253 passed | 1 skipped (254)
            Tests  3371 passed | 10 skipped (3381)
         Start at  07:14:18
         Duration  151.67s (tests 81%, import 16%, transform 3%)

          Isolate  254 workers spawned · ~117ms startup each (spawn + environment, per file)
                   at least ~9.80s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.19.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-11-12T07:16:52Z"
    tree: 17145be3ced57307337003074e746812e384f166bcf00979afb5cb31c8757c41
  commits:
    - 10be0fe
    - 139ea63
    - 1777cf3
    - 26454a6
    - "2762863"
    - 280999b
    - 2a4785d
    - 347467d
    - 3b6ad9e
    - 441a240
    - "4850467"
    - 4a2e710
    - 56ac448
    - 5a2674d
    - "6574710"
    - 6aca388
    - 741a155
    - "76492e3"
    - 79246cf
    - 7ddd569
    - "8049e15"
    - 8c7f091
    - 9cfda54
    - a079f81
    - aa93391
    - ace71fc
    - b43e7d6
    - ba29099
    - c3eb267
    - c4eab09
    - c4f995f
    - cb50be9
    - dd124a1
    - e6e94a4
    - eb11b82
    - fd66af5
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-11-12T07:17:35Z"
    passed: true
    tree: 17145be3ced57307337003074e746812e384f166bcf00979afb5cb31c8757c41
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /tmp/claude-0/-home-user-data-dashboard/c4894b2f-b21b-5e0c-b029-c44ab5dcf375/scratchpad/wt20/package-lock.json file and found 837 packages
          End status: 270 dirs visited, 2030 inodes visited, 1 Extract calls, 56.433882ms elapsed, 56.434075ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.19.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Unggahan ke dataset per periode bisa memilih Ganti (perilaku lama), Tambah baris, atau Perbarui berdasarkan kunci: dengan kolom kunci pilihan pemilik per sheet data, baris berkunci sama dikoreksi (pindah periode bila tanggalnya berubah), kunci baru ditambahkan, baris lain tetap — satu bulan yang terpecah ke beberapa file cukup diunggah berurutan dan aktif otomatis; kunci dobel/kosong di file menolak unggahan dengan daftarnya.

## Acceptance criteria
- [x] Per unggahan (atau per periode di layar tinjauan) pilih: Ganti utuh (sekarang), Tambah (baris file ditambahkan ke periode), atau Perbarui berdasarkan kunci (baris berkunci sama diganti versi file, kunci baru ditambah, baris lama yang tidak ada di file tetap)
- [x] Kunci = satu/lebih kolom pilihan pemilik per dataset (mis. No. Resi); kunci kosong/duplikat di file dilaporkan di tinjauan sebelum diterapkan
- [x] Tinjauan menampilkan per periode: diperbarui N, ditambah N, tetap N (bukan hanya Sekarang/Setelah)
- [x] Tidak ada periode yang menyusut tanpa sengaja: periode yang datanya lebih sedikit dari sekarang bisa dikecualikan dari unggahan di layar tinjauan

## Risk
Impact: kunci yang tidak unik membuang baris lama → laporan kunci dobel saat menyimpan kunci + tinjauan wajib bila kunci dobel lama digabung; Pulihkan per periode setelah baris pindah diberi peringatan. Beban: unduhan typed semua segmen per Perbarui (T-yg3z). Security: savePeriodKeys pemilik saja, posisi kolom zod int (tanpa SQL dari klien). Rollback: migrasi aditif, image v1.19 mengabaikan kolom baru (selesaikan unggahan tertunda dulu). Validation: unit + integrasi rantai unggahan + e2e period-keys + proyek period-*.

## Notes
- 2026-11-11T16:33:39Z Permintaan pemilik 2026-11-11 (tangkapan layar tinjauan: April 2026 115.741 → 34.024 'Diganti'). Butuh keputusan desain: cakupan kunci (per periode vs seluruh dataset — baris yang tanggalnya pindah periode), aturan duplikat, ADR baru. Dikerjakan setelah v1.18 bersama T-jsmj.
- 2026-11-12T01:14:52Z Keputusan pemilik 2026-11-12: (1) kunci dinamis — pemilik memilih satu/lebih kolom kunci per dataset sesuai kebutuhan, tidak dikhususkan untuk dataset tertentu; (2) baris dengan kunci sama yang tanggalnya pindah periode DIPINDAH ke periode baru (kunci berlaku seluruh dataset, tidak dobel); (3) kunci dobel di file → unggahan ditolak dengan notifikasi berisi daftar kunci/baris yang dobel.
- 2026-11-12T01:35:39Z AC4 (periode menyusut bisa dikecualikan di tinjauan) dikerjakan terpisah di T-aavf (v1.19). Tambah/Perbarui berdasarkan kunci → v1.20 (butuh ADR + migrasi kolom kunci).
- 2026-11-12T05:42:41Z Rencana docs/ai/plans/2026-11-12-perbarui-berdasarkan-kunci.md + ADR-0011 (proposed): tulis ulang periode terdampak sebagai kelompok baru; Dataset.periodKeys; mode REPLACE/APPEND/UPSERT; K4 tanpa konfirmasi bila bersih.
- 2026-11-12T07:02:36Z Implementasi v1.20 (ADR-0011 accepted): migrasi period_keys; keyMerge + pemadatan salinan; mode REPLACE/APPEND/UPSERT di unggah tunggal + antrean; kolom kunci di Atur periode; tinjauan UPDATED + hitungan. Review 1: 0 blokir/13 (M1–M4 + L5/L8 diperbaiki); review 2: 0 blokir/8 (M1, L3, L4, L5 diperbaiki). Sisa → T-yg3z. AC1 per unggahan (bukan per periode di tinjauan); AC2 kunci dobel/kosong ditolak dengan daftar sebelum tinjauan (keputusan pemilik K3); AC4 lewat T-aavf.
- 2026-11-12T07:13:06Z e2e: period-keys + ingest, versions, period-setup…period-cycle lulus (v1.20 ace71fc). AC1: pilihan per unggahan (panel + antrean); AC2: kunci dobel/kosong menolak unggahan dengan daftar (keputusan pemilik); AC3: tinjauan/riwayat menampilkan baru/diperbarui/pindah; AC4: T-aavf.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — app (savePeriodKeys, init unggah) memvalidasi; worker memproses file pemilik; ADR-0011
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak ada perubahan autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak ada perubahan sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — savePeriodKeysAction asOwner + loadBase(ownerId) + lineage difilter datasetId; init unggah/antrean tetap cek pemilik
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — zod (posisi kolom int ≤ MAX_COLUMN, ≤ 5, unik; periodMode enum); SQL kunci dari posisi Math.trunc, path lewat lit()
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data kriptografi baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — pesan penolakan hanya menyebut nilai kunci data pemilik sendiri; AuditLog dataset.period.keys
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — contoh kunci ≤ 50 di pesan versi (terlihat pemilik saja), tidak dicatat ke log server
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru; npm audit 0
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — acuan basi (snapshot/baseVersionId) memaksa proses ulang; batas periode/segmen tetap; Tambah berulang & kunci dobel lama wajib ditinjau
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — jalur unggah tidak berubah; berkas kerja di direktori tmp worker
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — periodMode divalidasi validateInit/zod antrean; aksi server lewat rate limit asOwner
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa konfigurasi baru; bawaan = Ganti (perilaku lama)

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-11-12T07:16:52Z (224433 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 10be0fe, 139ea63, 1777cf3, 26454a6, 2762863, 280999b, 2a4785d, 347467d, 3b6ad9e, 441a240, 4850467, 4a2e710, 56ac448, 5a2674d, 6574710, 6aca388, 741a155, 76492e3, 79246cf, 7ddd569, 8049e15, 8c7f091, 9cfda54, a079f81, aa93391, ace71fc, b43e7d6, ba29099, c3eb267, c4eab09, c4f995f, cb50be9, dd124a1, e6e94a4, eb11b82, fd66af5
- Review pass 1 by claude-reviewer-subagent: 13 findings
- Review pass 2 by claude-reviewer-subagent: 8 findings
