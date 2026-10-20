---
id: T-053
title: 'Ubah panel unggah: ''Tambah atau perbarui periode'' dan pemilih periode'
status: done
profile: standard
goal: G-6
tags:
  - ui
  - upload
depends_on:
  - T-052
created: "2026-10-15T02:30:57Z"
updated: "2026-10-20T14:32:13Z"
closed: "2026-10-20T14:32:13Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: b42141b81bced877b1f0171bc03e731564af9449
paths:
  - playwright.config.ts
  - src/app/(app)/datasets/[id]/page.tsx
  - src/components/datasets/ingest-progress.tsx
  - src/components/datasets/upload-panel-state.ts
  - src/components/datasets/upload-panel.tsx
  - src/components/datasets/upload-period-picker.tsx
  - src/features/ingest/ingest.ts
  - src/features/ingest/period-ingest.ts
  - src/features/schema/runtime.ts
  - src/features/schema/service.ts
  - src/features/uploads/period-label.ts
  - src/features/uploads/service.ts
  - src/features/versions/period-upload.ts
  - tests/components/upload-panel-period.test.ts
  - tests/e2e/period-upload-panel.spec.ts
  - tests/features/uploads/period-label.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T14:28:27Z"
      findings: 6
    - "n": 2
      by: claude-code
      at: "2026-10-20T14:28:27Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 197677
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792506651760,"service":"data-dashboard","host":"127.0.0.1","port":33413,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792506651819,"service":"data-dashboard","host":"127.0.0.1","port":46253,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792506651923,"service":"data-dashboard","host":"127.0.0.1","port":41523,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792506652041,"service":"data-dashboard","host":"127.0.0.1","port":46023,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792506659204,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792506670338,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792506670360,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792506670363,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792506670372,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  185 passed | 1 skipped (186)
            Tests  2408 passed | 10 skipped (2418)
         Start at  14:29:27
         Duration  136.57s (tests 83%, import 14%, transform 3%)

          Isolate  186 workers spawned · ~163ms startup each (spawn + environment, per file)
                   at least ~9.95s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T14:31:46Z"
    tree: a25aced33587d7d86bfceb8a907b319ca861232bacf108172e30ba733d463254
  commits:
    - 08ca5b4
    - 0cb153a
    - "1220871"
    - 14bbbc8
    - 17d81a7
    - 18b74cc
    - 1b2b9ab
    - 23e5ae9
    - 258a139
    - 27924c4
    - 27986dc
    - 29fe0f3
    - 2d7b316
    - 337259e
    - 3602b55
    - 36afc9f
    - 3b96186
    - 3bb3baa
    - 49f49a5
    - 4bd9881
    - 4eea84c
    - 5101f51
    - 538221d
    - 5603fc7
    - 56a8447
    - 56e4d6d
    - 59ec9a3
    - "6123427"
    - 62ec216
    - 686497c
    - 69b8953
    - 6b3ee3f
    - 70136f5
    - "7187327"
    - 75cf456
    - 76e3ce7
    - "7824e56"
    - 7ae2840
    - 7af4484
    - 7d64743
    - 7f238c4
    - 7f9a7c7
    - "8570e80"
    - 8f8df38
    - 8fc3abc
    - 90e4e63
    - 9159d7c
    - "9298e14"
    - 930dd6d
    - 94bea50
    - 94d85a4
    - 9bd7e54
    - a019f8f
    - a03481c
    - a0e1646
    - a687d4c
    - a8f9162
    - acb27a6
    - ae4e5a2
    - af1994a
    - b0b99d8
    - b30aea5
    - b32d50d
    - b42141b
    - b8e59ee
    - b933279
    - ba2efef
    - bafb4ad
    - c15362c
    - c1c8b0a
    - c2fd95c
    - c3626c9
    - c76c343
    - ca5782f
    - ccd0a9a
    - ce26ca5
    - ce5d6a7
    - ce649d0
    - cf28ad3
    - cf730c5
    - d32a8ea
    - d557c9e
    - da46e35
    - dfc2ebb
    - dff9b8c
    - e24e070
    - e51fcb4
    - f197114
    - f3ea697
    - f54828c
    - f55d8d2
    - f5b2aa6
    - f87b0a1
    - f9d43c6
    - fc288cb
    - fc87996
  acceptance:
    total: 4
    done: 4
  audit:
    at: "2026-10-20T14:31:46Z"
    passed: true
    tree: a25aced33587d7d86bfceb8a907b319ca861232bacf108172e30ba733d463254
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 497 dirs visited, 2930 inodes visited, 1 Extract calls, 222.566109ms elapsed, 222.566453ms wall time
          Loaded npm local db from /root/.cache/osv-scalibr/npm/all.zip

          No issues found
      - name: npm audit (prod high, dev critical)
        exit_code: 0
        summary: |-
          > data-dashboard@0.1.0 audit
          > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

          found 0 vulnerabilities
          found 0 vulnerabilities
      - name: aitk secret scan (tracked files)
        exit_code: 0
---

## Objective
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-21, Fase 3. Perkiraan 2–3 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given dataset periode, when panel unggah dibuka, then tampil dropzone utama 'Tambah atau perbarui periode — periode yang sudah ada akan diganti, bukan digandakan' dan tautan sekunder 'Ganti semua data…' dengan konfirmasi 'Semua 18 periode akan diganti'
- [x] Given sheet berlabel, when file dipilih, then pemilih periode (satuan dataset, bukan teks bebas) terisi dari nama file dan bisa diubah sebelum diproses; tanpa tebakan, pemilih wajib diisi
- [x] Given dataset non-periode, then panel sama seperti sekarang dengan tautan 'Ingin menyimpan data per bulan? Atur periode', dan helper e2e lama lolos
- [x] Given unggahan sedang diproses, then tahap 'Membaca periode' tampil di progres

## Risk
Impact: panel unggah di halaman dataset (semua dataset). Dataset non-periode: perilaku sama (REPLACE, helper e2e lama). Dataset periode: dropzone utama = init mode PERIOD terhadap versi aktif (baseVersionId), "Ganti semua data…" = REPLACE lewat input terpisah setelah konfirmasi. Tahap progres "periode" baru di worker periode (tampilan saja).
Security (STRIDE): tidak ada endpoint baru; init tetap memvalidasi mode/label/baseVersionId di server (T-052, STALE/INVALID); konteks panel dibaca di server hanya untuk pemilik (findFirst ownerId). Label dari pemilih hanya saran klien — server memeriksa ulang awal periode.
Rollback: revert commit; tidak ada migrasi. Progres tersimpan dengan stage "periode" pada versi lama tetap aman (UI lama menampilkannya sebagai tahap tidak dikenal = tanpa sorotan).
Validation: unit period-label + upload-panel-period; e2e period-upload-panel 2/2, period-upload 4/4, period-setup 3/3, uploads 9/9, versions 7/7, ingest 4/4.

## Notes
- Pilihan unggahan (REPLACE / PERIOD+label) dibawa di status panel: "Coba lagi"/"Lanjutkan" dan file sama dengan unggahan tertunda memakai mode + label yang sama (server hanya melanjutkan versi dengan pilihan sama, R20). getPendingUpload kini mengembalikan mode/label.
- Tebakan nama file: bulan/kuartal/tahun (angka, nama bulan id/en, Q/kuartal/triwulan); ambigu atau kurang rinci → kosong dan wajib diisi.
- STALE saat init → tombol "Muat ulang data" (router.refresh) agar versi dasar baru dipakai.
- Asumsi: "Ganti semua data" menghasilkan versi biasa (bukan per periode) — dialog menjelaskannya dan bahwa versi sekarang tetap di riwayat.
- Review putaran 1 (orkestrator): M1 PERIOD tanpa konteks periode tidak pernah diturunkan ke REPLACE (periodRequest → galat + "Muat ulang data", tanpa init); M2 unggahan "ganti semua" tertunda dipilih di dropzone periode → dialog konfirmasi dulu; M3 tebakan nama file: spasi setelah q/tw/kuartal/triwulan, semester/S1/S2/H1 → kosong, rentang bulan dan angka/tahun sisa → kosong; L1 Batal pemilih → fokus "Pilih file"; L2 tertunda PERIOD tanpa label pada data berlabel → pemilih; L3 tanpa "Semua 0 periode". Tes: unit upload-panel-period + period-label, e2e period-upload-panel 2/2 (M2, L1).
- Plugin frontend-expert tidak tersedia di sesi cloud ini; pola UI mengikuti komponen yang ada (token, Tabler, ConfirmDialog, Select Radix, target 44 px di ponsel).

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — konteks panel dibaca server (RSC), keputusan mode/label divalidasi ulang di init (server)
- [x] V2 Authentication: N/A — tidak mengubah autentikasi; halaman tetap requireUser()
- [x] V3 Session management: N/A — tidak menyentuh sesi
- [x] V4 Access control: periodUploadContext memfilter ownerId (lainnya null); init tetap cek pemilik + STALE baseVersionId
- [x] V5 Validation, sanitization and encoding: label dari pemilih tervalidasi server (ISO + awal periode); nama file hanya dirender sebagai teks React
- [x] V6 Stored cryptography: N/A — tidak ada data rahasia baru
- [x] V7 Error handling and logging: galat init ditampilkan dari pesan server Bahasa Indonesia; tidak ada log baru
- [x] V8 Data protection: N/A — hanya metadata periode milik pemilik
- [x] V9 Communication: N/A — tidak ada lalu lintas eksternal baru
- [x] V10 Malicious code: tanpa dependensi baru (package-lock tidak berubah)
- [x] V11 Business logic: versi dasar basi → STALE di server; resume hanya dengan mode + label sama; "Ganti semua data" butuh konfirmasi eksplisit
- [x] V12 Files and resources: pra-cek + pemeriksaan server unggahan tidak berubah (T-003)
- [x] V13 API and web service: N/A — tidak ada API baru; /api/uploads (T-052) dipakai apa adanya
- [x] V14 Configuration: N/A — tanpa konfigurasi/env baru

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T14:31:46Z (197677 ms)
- Acceptance criteria: 4/4 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 337259e, 3602b55, 36afc9f, 3b96186, 3bb3baa, 49f49a5, 4bd9881, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 59ec9a3, 6123427, 62ec216, 686497c, 69b8953, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, a019f8f, a03481c, a0e1646, a687d4c, a8f9162, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, c15362c, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d557c9e, da46e35, dfc2ebb, dff9b8c, e24e070, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 6 findings
- Review pass 2 by claude-code: 0 findings
