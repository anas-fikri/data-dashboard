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
updated: "2026-10-19T17:44:05Z"
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
Impact: penyimpanan dan siklus hidup data — layout objek segmen baru (parquet/<ds>/seg/<id>/), retensi versi (objek tidak lagi dihapus per prefix versi), pembersihan StorageCleanup (jenis segmen/kunci data + penundaan), recast/pemetaan (revisi lama tidak dihapus 1 jam), aktivasi (ingest, pemetaan, rollback) kini bisa ditolak gerbang integritas, worker (job segment-gc tiap jam, segment-audit 03.00 WIB), banner admin. Migrasi DB: FK Segment.createdByVersionId CASCADE → SET NULL, kolom unreferencedAt (Segment/SegmentTyped) dan SegmentTyped.dataRows; tanpa pemindahan data. Ruang storage dipakai ≤ 24 jam lebih lama untuk versi yang dibuang.
Security (STRIDE): Tampering/Denial (data hilang) — penghapusan hanya untuk kunci yang tidak dirujuk versi hidup (aktif, READY, non-terminal) selama ≥ 24 jam; dihitung ulang tiap putaran (tanpa penghitung), di bawah kunci Dataset dengan snapshot REPEATABLE READ, lalu StorageCleanup memeriksa ulang rujukan (Segment, SegmentTyped, sheet versi hidup) tepat sebelum menghapus; FK NoAction manifest→revisi menolak hapus revisi yang masih dirujuk. deleteObject hanya menerima pola DATA_KEY; prefix lain tidak pernah disentuh. Repudiation — GC/audit/aktivasi gagal integritas dicatat di log terstruktur; versi gagal integritas berstatus FAILED dengan pesan. Information disclosure — banner integritas hanya untuk admin, tanpa isi data. Galat storage sementara saat rollback tidak menandai versi gagal.
Rollback: revert commit T-038 + migrasi turun (FK kembali CASCADE, kolom baru dibuang: aman, tidak dibaca kode lama). Segmen yang sudah ditulis di seg/ tetap terbaca kode lama (kunci disimpan lengkap di Segment/SegmentTyped/Sheet), tetapi retensi lama yang menghapus per prefix versi tidak menyentuh seg/ — objek seg/ milik versi yang dibuang akan tertinggal sampai dibersihkan manual (parquet/<ds>/seg/<id>/ tanpa baris Segment).
Validation: unit — gcPlan + sweepTargets + simulasi 200 langkah acak (ingest/recast/retensi/rollback/GC/cleanup) tanpa kunci terujuk hilang, uji mutasi membuktikan tes gagal bila aturan hidup salah; StorageCleanup jenis baru + penundaan; gerbang integritas (manifest, HEAD, DuckDB file typed nyata); audit malam; runner GC (kunci + isolasi); ingest/pemetaan/rollback gagal integritas → FAILED, aktif tetap; finalizeFailed + direktori mapping-*. Seluruh unit 2.088+ lulus. e2e versions 7/7 (retensi → GC tandai/sapu → cleanup → rollback + KPI), ingest/schema/mapping lulus.

## Notes

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — GC mark-and-sweep di worker (job maintenance yang sudah ada), tanpa layanan baru; keputusan hapus dua lapis: rencana GC di bawah kunci Dataset + pemeriksaan ulang StorageCleanup
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A — tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A — tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — rollback tetap pemilik saja (gerbang integritas memakai filter pemilik yang sama); banner integritas hanya untuk admin; job GC/audit hanya di worker
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — kunci yang boleh dihapus satuan dibatasi pola DATA_KEY/SEGMENT_PREFIX (cuid + nama file tetap); id segmen dibuat dari randomBytes dan divalidasi sebelum menjadi prefix
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A — tidak ada data rahasia baru
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — kunci terujuk hilang → logger.error dengan contoh kunci + status admin; gagal integritas → versi FAILED dengan pesan yang bisa ditindak; galat storage sementara saat rollback → coba lagi, bukan FAILED; GC satu dataset gagal tidak menahan yang lain
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — data versi hidup tidak pernah dihapus (aturan hidup + tenggang 24 jam + cek ulang + FK); objek yatim hanya disapu bila tidak tercatat dan lebih tua dari tenggang
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A — tidak ada lalu lintas eksternal baru (HEAD/List ke storage internal yang sama)
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — retensi 3 READY + aktif tidak berubah; objek versi yang dibuang dihapus setelah tenggang; verifyVersionIntegrity fail-closed sebelum setiap aktivasi
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — direktori kerja mapping-* ikut disapu saat worker start; audit malam membatasi sampel log 20 kunci; HEAD paralel 8
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — tidak ada endpoint baru; aksi rollback bisa mengembalikan INVALID/DATASET_BUSY dengan pesan baru
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — tanpa variabel env baru (SEGMENT_GC_GRACE_HOURS konstanta 24); jadwal job di worker; npm audit 0 kerentanan
