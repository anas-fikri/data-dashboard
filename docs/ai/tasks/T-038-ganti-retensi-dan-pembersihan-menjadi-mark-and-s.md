---
id: T-038
title: Ganti retensi dan pembersihan menjadi mark-and-sweep segmen dengan gerbang integritas
status: in_progress
profile: strict
profile_pinned: true
goal: G-6
tags:
  - data-safety
  - storage
depends_on:
  - T-036
created: "2026-10-15T02:30:55Z"
updated: "2026-10-19T17:39:13Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 7187327144f1a1cff8b5e44c4cb16de2b1c130f3
evidence:
  check:
    cmd: npm run check
    exit_code: 1
    duration_ms: 107995
    summary: |-
      …asi SFTP tes koneksi ditolak NAS"}
       ❯ tests/features/backup/probe.test.ts (12 tests | 1 failed) 188ms
         ❯ probeOffsite (11)
           × NAS penuh/kuota habis (file kecil masuk, besar ditolak) → tes gagal dengan petunjuk ruang/kuota 5ms
      {"level":40,"time":1792431504658,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792431504684,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792431504687,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792431504686,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792431504692,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

      ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

       FAIL  tests/features/backup/probe.test.ts > probeOffsite > NAS penuh/kuota habis (file kecil masuk, besar ditolak) → tes gagal dengan petunjuk ruang/kuota
      Error: Cannot parse privateKey: Malformed OpenSSH private key
       ❯ new Server node_modules/ssh2/lib/server.js:249:15
       ❯ startFakeSftp tests/stubs/sftp-server.ts:193:18
          191|   const clients = new Set<Connection>();
          192|   const stats = { passwordAttempts: 0 };
          193|   const server = new Server({ hostKeys: [keys.private] }, (client) => {
             |                  ^
          194|     clients.add(client);
          195|     client.on("close", () => clients.delete(client));
       ❯ tests/features/backup/probe.test.ts:140:23

      ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


       Test Files  1 failed | 160 passed (161)
            Tests  1 failed | 2087 passed (2088)
         Start at  00:38:00
         Duration  72.79s (tests 78%, import 17%, transform 4%)

          Isolate  161 workers spawned · ~257ms startup each (spawn + environment, per file)
                   at least ~4.35s faster with isolate: false — reuses workers across files instead of one per file
    at: "2026-10-19T17:39:13Z"
    tree: 35bff4da1c157b9263d545256773a4f06908c72745f863da67569965bbf95caa
  check_failures: 2
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-6, Fase 1. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [ ] Given segmen dirujuk versi hidup (aktif, READY tersimpan, non-terminal), when retensi dan cleanup berjalan, then objeknya tidak dihapus; segmen tak terujuk ≥ SEGMENT_GC_GRACE_HOURS dihapus beserta raw dan typed semua revisinya
- [ ] Given job invarian malam, when ada kunci terujuk yang hilang, then alert tercatat di log dan status admin
- [ ] Given verifyVersionIntegrity sebelum aktivasi menemukan selisih (jumlah baris ≠ metadata, _row ganda, atau kunci terujuk tidak ada), then versi FAILED dan versi aktif tidak berubah
- [ ] Given crash di tengah unggahan atau pemetaan, then objek yatim di seg/ dan direktori kerja mapping-* dibersihkan (regex deleteObject diperluas)
- [ ] Given test berulang retensi → cleanup → query → rollback, then tidak ada kunci terujuk yang hilang

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
