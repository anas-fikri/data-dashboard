---
id: T-1k96
title: Widget baru mengisi baris kosong di dashboard
status: done
profile: strict
tags:
  - ui
created: "2026-10-22T03:19:57Z"
updated: "2026-10-22T07:17:12Z"
closed: "2026-10-22T07:17:12Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 925c090568dd5fffe172c5258c98c4b5a92ad8f0
paths:
  - content/panduan/06-susun-dashboard.md
  - src/components/dashboards/use-dashboard-editor.ts
  - src/features/dashboards/service.ts
  - src/features/dashboards/validation.ts
  - tests/e2e/dashboards.spec.ts
  - tests/e2e/sharing.spec.ts
  - tests/features/dashboards/dashboards.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T07:05:46Z"
      findings: 3
    - "n": 2
      by: claude-reviewer-subagent
      at: "2026-10-22T07:10:45Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 209473
    summary: |-
      …olak NAS"}
      {"level":40,"time":1792652976626,"service":"data-dashboard","host":"127.0.0.1","port":42839,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792652995995,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792652996019,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792652996023,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792652996033,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792653008522,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792653008541,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  224 passed | 3 skipped (227)
            Tests  3028 passed | 29 skipped (3057)
         Start at  07:08:12
         Duration  142.84s (tests 83%, import 14%, transform 3%)

          Isolate  227 workers spawned · ~123ms startup each (spawn + environment, per file)
                   at least ~9.15s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T07:10:37Z"
    tree: a0301731fd738299b6e9c4a746ae2ba674d09a74c8f4185b9b3d31002749c7a8
  commits:
    - 14b219f
    - 3b83c4e
    - 3d38afd
    - 43e0d50
    - 4af631d
    - "7266741"
    - 829d5ba
    - 925c090
    - 95344b2
    - 9b36c7d
    - ad5caec
    - cb1f89f
    - e69d344
    - f09d71f
    - f5805f9
  acceptance:
    total: 1
    done: 1
  audit:
    at: "2026-10-22T07:10:46Z"
    passed: true
    tree: a0301731fd738299b6e9c4a746ae2ba674d09a74c8f4185b9b3d31002749c7a8
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 375 dirs visited, 2110 inodes visited, 1 Extract calls, 54.482388ms elapsed, 54.482541ms wall time
          Loaded npm local db from /root/.cache/osv-scanner/npm/all.zip
          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@1.3.1 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Tambah widget tidak lagi selalu menaruh widget baru di x = 0 di bawah semua widget (tiga widget = tiga
baris bertumpuk). Server memilih tempat kosong pertama setinggi widget baru di pita baris terbawah
(newWidgetSlot), sehingga tiga kali Tambah widget pada dashboard kosong menghasilkan tiga widget 4×4
dalam satu baris (x = 0, 4, 8); lubang di atas pita itu tidak diisi agar widget baru tidak muncul di
tengah dashboard panjang. Urungkan hapus memulihkan widget tepat di posisi semula (widget yang dipulihkan
dipaku saat pemadatan — sebelumnya pemadat mengurutkan menurut (y, x) sehingga widget lain berx lebih
kecil yang naik ke tempatnya menang dan widget yang dipulihkan terdorong ke bawah).

## Acceptance criteria
- [x] Tiga kali Tambah widget pada dashboard kosong menghasilkan tiga widget 4x4 di satu baris (x = 0, 4, 8); urungkan tetap memulihkan

## Risk
Impact: hanya posisi widget BARU (POST widgets tanpa `at`) dan pemadatan saat urungkan hapus; tata letak
tersimpan tidak berubah. Tes e2e yang mengandalkan widget baru di bawah disesuaikan (geser pertama yang
aktif; layar lebih pendek untuk uji gulir).
Security (STRIDE): tidak ada jalur/akses baru; fungsi murni di validation.ts dipanggil di transaksi
addWidget yang sama (lock + revisi). D — pencarian tempat O(tinggi × 12 × jumlah widget ≤ 50), kecil.
Rollback: revert commit; tanpa migrasi.
Validation: tests/features/dashboards/dashboards.test.ts (newWidgetSlot, compactLayout dipaku, addWidget
di samping), e2e dashboards.spec "T-1k96 …" + hapus/urungkan, proyek schema/widgets/versions/mapping/
sharing lulus.

## Notes
- Asumsi (keputusan standar): yang diisi hanya pita baris terbawah setinggi widget baru, bukan lubang
  di mana saja. Panduan 06 menyebut widget baru berjajar di samping widget terakhir.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — verified — boundary unchanged: placement computed server-side inside the existing addWidget transaction (lock + revision).
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — no authentication change.
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — no session change.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — verified — no new endpoint; addWidget keeps its edit-access check.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — verified — no new input; restore `at` still validated by the existing schema; slot always within 12 columns (randomized probe, 20k layouts).
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — no crypto.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A — error paths unchanged.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A — only layout coordinates.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — no external traffic.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — verified — no new dependencies or network calls.
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — verified — widget limit and STALE revision checks unchanged; slot search bounded (≤ 50 widgets × 12 cols × h rows).
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A — no file handling.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — verified — API shape unchanged.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A — no configuration change.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-22T07:10:37Z (209473 ms)
- Acceptance criteria: 1/1 satisfied
- Commits: 14b219f, 3b83c4e, 3d38afd, 43e0d50, 4af631d, 7266741, 829d5ba, 925c090, 95344b2, 9b36c7d, ad5caec, cb1f89f, e69d344, f09d71f, f5805f9
- Review pass 1 by claude-reviewer-subagent: 3 findings
- Review pass 2 by claude-reviewer-subagent: 0 findings
