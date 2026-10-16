---
id: T-030
title: 'Ingest CSV id-ID: desimal gaya US tunggal tidak membalik locale satu kolom'
status: in_progress
profile: standard
profile_pinned: true
tags:
  - bug
created: "2026-10-12T23:39:25Z"
updated: "2026-10-16T16:54:27Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 9b8693da3bb185a0f651ba447df51da077299ac0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 41643
    summary: |-
      > data-dashboard@0.1.0 check
      > npm run lint && npm run typecheck && npm run test && npm run audit


      > data-dashboard@0.1.0 lint
      > eslint . && prettier --check .

      Checking formatting...
      All matched files use Prettier code style!

      > data-dashboard@0.1.0 typecheck
      > tsc --noEmit


      > data-dashboard@0.1.0 test
      > vitest run


       RUN  v5.0.3 /Users/anasfikri/Documents/Projects/pcpexpress/data-dashboard/.claude/worktrees/t-001-scaffold

      {"level":40,"time":1792169644272,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792169644294,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792169644300,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  118 passed (118)
            Tests  1692 passed (1692)
         Start at  23:53:58
         Duration  28.29s (tests 76%, import 18%, transform 6%, worker 1%)

          Isolate  118 workers spawned · ~126ms startup each (spawn + environment, per file)
                   at least ~1.52s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-16T16:54:27Z"
    tree: cd7e27bcec1537ce4975df24d0b012ab2fd8a6950dc5cf63d4cc37213d773cf8
---

## Objective
Ditemukan verifikasi integritas T-011: pickLocale di src/features/ingest/infer.ts memilih locale US begitu ada satu bukti kuat US (mis. '1.5'), padahal mayoritas sel adalah ribuan id-ID ('1.234.567'); total widget jadi sekitar 1000x lebih kecil tanpa peringatan.

## Acceptance criteria
- [ ] Given CSV ber-locale id-ID dengan mayoritas angka ribuan bertitik dan satu sel '1.5', when di-ingest, then kolom tetap locale id-ID (total sesuai perhitungan id-ID) atau kolom ditandai ambigu dengan peringatan yang terlihat di halaman skema
- [ ] Given kolom yang ditandai ambigu, when user membuka skema, then pilihan locale tersedia dan koreksi menghasilkan angka yang benar

## Risk
Impact: skema kolom angka mendapat field opsional localeAmbiguous (Sheet.schema JSON; skema lama tanpa field = tidak ambigu) saat dibaca US padahal ada bukti ribuan id-ID (CSV '1.234'; xlsx teks berakhiran 0). Tipe/locale/nilai tidak berubah — hanya ditandai; editor skema menampilkan catatan + ikut filter 'bermasalah'; koreksi lewat 'Penulisan angka' yang sudah ada. Security (STRIDE): tidak ada permukaan baru (field boolean dari hitungan profil). Rollback: revert commit; field tambahan di skema tersimpan diabaikan kode lama. Validation: tes ingest (CSV + xlsx), recast ke Indonesia (1500, '1.5' gagal terhitung, tanda hilang), render baris kolom; uji mutasi.

## Notes

- 2026-10-13T01:15:20Z Temuan verifikasi T-011 putaran 2 (Info): kolom CSV id-ID berisi desimal kecil '0,004'…'0,124' terbaca sebagai ribuan gaya US (bilangan bulat 4…124). Pastikan kasus ini ikut dicakup: tiga digit setelah koma dengan bagian bulat 0 tidak boleh dianggap pemisah ribuan.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — perubahan di inferensi ingest (typed.ts resolve → localeAmbiguous dari hitungan profil) dan editor skema (column-row/column-editor); batas kepercayaan sama
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak menyentuh autentikasi
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak menyentuh sesi
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — halaman skema tetap dengan akses yang sama (pemilik/editor); tidak ada endpoint baru
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — field boolean dari server, teks catatan statis (React escape); tidak ada input baru
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — N/A: tidak ada jalur galat/log baru
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — N/A: tidak ada data pribadi baru
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tidak ada lalu lintas jaringan baru
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tidak ada dependensi baru; npm audit 0 kerentanan
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — angka yang bisa terbaca 1000× lebih kecil tanpa gagal konversi kini ditandai terlihat (sebelumnya diam-diam); koreksi locale menghasilkan angka benar dan gagal yang terhitung
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: batas unggah/ingest tidak berubah
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — N/A: tidak ada API baru (skema dikirim ke halaman seperti sebelumnya)
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tidak ada konfigurasi baru
