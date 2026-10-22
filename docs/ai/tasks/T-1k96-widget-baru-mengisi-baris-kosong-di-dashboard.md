---
id: T-1k96
title: Widget baru mengisi baris kosong di dashboard
status: in_review
profile: standard
tags:
  - ui
created: "2026-10-22T03:19:57Z"
updated: "2026-10-22T07:05:46Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 925c090568dd5fffe172c5258c98c4b5a92ad8f0
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T07:05:46Z"
      findings: 3
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 224388
    summary: |-
      …olak NAS"}
      {"level":40,"time":1792652597211,"service":"data-dashboard","host":"127.0.0.1","port":34127,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792652617650,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792652617674,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792652617679,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792652617701,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792652634887,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792652634915,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  224 passed | 3 skipped (227)
            Tests  3027 passed | 29 skipped (3056)
         Start at  07:01:41
         Duration  153.81s (tests 83%, import 14%, transform 3%)

          Isolate  227 workers spawned · ~131ms startup each (spawn + environment, per file)
                   at least ~9.81s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T07:04:16Z"
    tree: 3a8a31efee364b7a262c19d0a242379ec461c589b39004ec94ae92e3353e4ba2
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
