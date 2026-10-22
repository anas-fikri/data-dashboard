---
id: T-vb7q
title: Filter bawaan per kolom filter dashboard
status: in_review
profile: standard
tags:
  - ui
  - security
created: "2026-10-22T03:20:00Z"
updated: "2026-10-22T11:20:08Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: 625cf78cea1d5ee89632a4a96f2be84db34fd163
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-22T11:20:08Z"
      findings: 6
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 220372
    summary: |-
      …olak NAS"}
      {"level":40,"time":1792667594276,"service":"data-dashboard","host":"127.0.0.1","port":33187,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792667619844,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792667619865,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792667619870,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792667619883,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}
      {"level":40,"time":1792667627940,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792667627969,"service":"data-dashboard","err":"\nInvalid `db.datasetVersion.findMany()` invocation in\n/home/user/data-dashboard/src/features/uploads/quota.ts:92:23\n\n  89 \n  90 export async function userUsage(db: Db, userId: string): Promise<Usage> {\n  91   const [versions, refs, reserved] = await Promise.all([\n→ 92     db.datasetVersion.findMany(\nerror: Environment variable not found: DATABASE_URL.\n  -->  schema.prisma:9\n   | \n 8 |   provider = \"postgresql\"\n 9 |   url      = env(\"DATABASE_URL\")\n   | \n\nValidation Error Count: 1","msg":"kuota pengguna tidak terbaca"}

       Test Files  225 passed | 3 skipped (228)
            Tests  3048 passed | 29 skipped (3077)
         Start at  11:11:43
         Duration  151.31s (tests 82%, import 14%, transform 4%)

          Isolate  228 workers spawned · ~127ms startup each (spawn + environment, per file)
                   at least ~9.49s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@1.3.1 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-22T11:14:16Z"
    tree: dabe83931bb853ba8cc89a5eb8643196fc27eda44dd8d2014264ff52207ca4c0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Pemilik/editor bisa memasang nilai bawaan per kolom filter (tanggal: preset mis. Bulan ini; kategori: nilai terpilih)
- [ ] Viewer yang membuka tanpa ?f melihat filter bawaan aktif dengan label bawaan; Hapus semua filter menampilkan seluruh data; body permintaan tetap {widgetId, dashboardFilters}
- [ ] Ekspor dan PDF memakai filter aktif yang sama

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
