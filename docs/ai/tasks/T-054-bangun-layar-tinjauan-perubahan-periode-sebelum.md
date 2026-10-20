---
id: T-054
title: Bangun layar tinjauan perubahan periode sebelum data diganti atau dilepas
status: done
profile: strict
goal: G-6
tags:
  - ui
  - data-safety
  - a11y
depends_on:
  - T-052
  - T-043
created: "2026-10-15T02:30:58Z"
updated: "2026-10-20T15:19:05Z"
closed: "2026-10-20T15:19:05Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/intelligent-albattani-fd1va8
base: d4c20297623f582d2777219170ddc61fcbc22021
paths:
  - playwright.config.ts
  - prisma/schema.prisma
  - src/app/(app)/datasets/[id]/data/page.tsx
  - src/app/(app)/datasets/[id]/page.tsx
  - src/app/(app)/datasets/[id]/tinjau/[versionId]/page.tsx
  - src/components/datasets/period-review-form.tsx
  - src/components/datasets/period-setup-form.tsx
  - src/components/datasets/period-usage.tsx
  - src/components/datasets/upload-panel.tsx
  - src/components/datasets/version-history-row.tsx
  - src/components/schema/sheet-tabs.tsx
  - src/features/ingest/period-ingest.ts
  - src/features/ingest/period-review.ts
  - src/features/ingest/period-setup-plan.ts
  - src/features/query/grid-page.ts
  - src/features/versions/period-review.ts
  - tests/e2e/period-review.spec.ts
  - tests/features/ingest/period-ingest.test.ts
  - tests/features/ingest/period-review.test.ts
  - tests/features/query/grid-page.test.ts
review:
  passes:
    - "n": 1
      by: claude-reviewer-subagent
      at: "2026-10-20T15:15:19Z"
      findings: 5
    - "n": 2
      by: claude-code
      at: "2026-10-20T15:15:20Z"
      findings: 0
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 197037
    summary: |-
      …t
      > vitest run


       RUN  v5.0.3 /home/user/data-dashboard

      {"level":40,"time":1792509463620,"service":"data-dashboard","host":"127.0.0.1","port":45707,"step":"membuka folder","code":2,"err":"No such file or directory","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792509463676,"service":"data-dashboard","host":"127.0.0.1","port":46337,"err":"Unable to start subsystem: sftp","msg":"subsistem SFTP ditolak NAS"}
      {"level":40,"time":1792509463779,"service":"data-dashboard","host":"127.0.0.1","port":36459,"step":"menghapus file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792509463897,"service":"data-dashboard","host":"127.0.0.1","port":36665,"step":"menulis file uji","code":4,"err":"Failure","msg":"operasi SFTP tes koneksi ditolak NAS"}
      {"level":40,"time":1792509476340,"service":"data-dashboard","err":"Can't reach database server","msg":"sesi shell gagal dibaca"}
      {"level":40,"time":1792509480191,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792509480213,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}
      {"level":40,"time":1792509480217,"service":"data-dashboard","check":"Y","detail":"mati","msg":"health check gagal"}
      {"level":40,"time":1792509480227,"service":"data-dashboard","check":"Renderer PDF","detail":"renderer tidak menjawab /healthz","msg":"health check gagal"}

       Test Files  186 passed | 1 skipped (187)
            Tests  2420 passed | 10 skipped (2430)
         Start at  15:16:17
         Duration  138.32s (tests 84%, import 13%, transform 2%)

          Isolate  187 workers spawned · ~160ms startup each (spawn + environment, per file)
                   at least ~9.82s faster with isolate: false — reuses workers across files instead of one per file


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-20T15:18:38Z"
    tree: 38ace5a4de2e5247dafa26b4696b70f66b33bc9031b0a44947152eb8bb767e70
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
    - 4e9a95e
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
    - 6a7cef1
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
    - d4c2029
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
    total: 5
    done: 5
  audit:
    at: "2026-10-20T15:18:38Z"
    passed: true
    tree: 38ace5a4de2e5247dafa26b4696b70f66b33bc9031b0a44947152eb8bb767e70
    results:
      - name: osv-scanner (dependencies, offline db)
        exit_code: 0
        summary: |-
          Scanning dir .
          Starting filesystem walk for root: /
          Scanned /home/user/data-dashboard/package-lock.json file and found 836 packages
          End status: 501 dirs visited, 3032 inodes visited, 1 Extract calls, 265.901826ms elapsed, 265.902179ms wall time
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
Bagian rencana docs/ai/plans/2026-10-15-tampilan-excel-dan-data-periode.md — P-22, Fase 3. Perkiraan 3–4 hari. Baca bagian rencana yang relevan (§3 Lihat data, §4 periode, §5 batas, §6 risiko) sebelum mulai; cek ulang kontrak T-016 (otorisasi) dan T-017 (ekspor) sesuai risiko R21.

## Acceptance criteria
- [x] Given rencana mengganti periode, melepas periode karena batas, menyusutkan periode > 50%, memuat periode kemungkinan nyasar, atau berasal dari label, then versi menjadi AWAITING_CONFIRM dan pemilik melihat tabel Periode | Sekarang | Setelah | Keterangan sebelum 'Terapkan'
- [x] Given penyusutan > 50%, then 'Terapkan' baru aktif setelah centang 'Saya paham Februari 2026 diganti dengan data yang lebih sedikit'; given periode kemungkinan nyasar, then default-nya 'Kecualikan' dengan jumlah baris tercatat, dan bisa diubah ke 'Masukkan'
- [x] Given sha256 sama dengan file asal sebuah periode, then tampil 'File ini identik dengan periode Maret 2026'; given label dengan rentang kolom tanggal acuan di luar label, then peringatan tampil
- [x] Given 'Lihat isi file', then grid membuka versi tertunda (hanya pemilik); given 'Batalkan upload' atau > 7 hari tanpa keputusan, then versi dibuang dan data aktif tidak berubah
- [x] Given sheet periode lama tidak ada di file baru, then tampil default 'Pertahankan data lama sheet itu'

## Risk
- Impact: UI baru (halaman tinjauan, ajakan di panel unggah/riwayat versi, pratinjau Lihat data ?version=)
  di atas aksi T-052 yang sudah ada; satu perubahan worker: sheet berlabel mencatat min/max kolom tanggal
  acuan di Segment.minDate/maxDate (sebelumnya null). Tanpa migrasi.
- Security (STRIDE): halaman tinjauan dan ?version= hanya pemilik (editor/asing → 404, e2e); endpoint grid
  tetap memakai authorizeGrid (PREVIEW_STATUSES khusus pemilik, T-043); "Terapkan" mengirim sidik rencana
  yang tampil (PLAN_STALE bila berbeda), centang menyusut/buang baris ditegakkan server; centang "dilepas"
  hanya penjaga klien (rencana yang dilepas sudah terkunci sidik).
- Rollback: revert commit; data tidak berubah bentuk (minDate/maxDate segmen berlabel hanya info).
- Validation: unit period-review (9) + period-ingest (+2) + grid-page (+1); e2e period-review 6/6 (axe
  serius/kritis 0, 360 px tanpa gulir horizontal), period-upload 4/4, period-upload-panel 2/2,
  period-setup 3/3, data-view 8/8, versions 7/7.

## Notes
- Layar: /datasets/:id/tinjau/:versionId (pemilik; versi tidak lagi menunggu → keadaan kosong). Tabel
  Periode | Sekarang | Setelah | Keterangan hanya periode yang disebut file atau dilepas (sisanya "N periode
  lain tidak berubah"), rincian per sheet bila > 1 sheet; meter batas sesudah diterapkan; peringatan
  (ditolak, identik, rentang label, sheet dipertahankan, sheet file yang diabaikan).
- AC1: e2e period-review "AC1 + AC2 + AC4" (pengganti Februari 4 → 1: tabel, ringkasan, meter) + "AC2"
  (nyasar + baru) + unit reviewRows (dilepas karena batas 24 periode, multi sheet, ditolak).
- AC2: e2e — Terapkan nonaktif sampai centang "Saya paham Februari 2026 diganti dengan data yang lebih
  sedikit"; nyasar Maret bawaan "Kecualikan" + "Maret 2026: 1 baris di file", "Masukkan" → Diganti.
  PLAN_STALE (pengaturan diubah di tab lain) → galat + rencana baru dimuat, Terapkan lagi berhasil.
- AC3: e2e — "File ini identik dengan periode Februari 2026"; dataset berlabel (kolom "Tanggal Kirim",
  label Mei 2026, isi April) → peringatan "di luar Mei 2026". Kolom acuan = kolom date/timestamp pertama
  (labelReferenceColumn); min/max dicatat worker di segmen berlabel (unit period-ingest).
- AC4: e2e — "Lihat isi file" membuka grid versi tertunda (banner pratinjau, 4 baris), pengguna lain →
  404 untuk tinjauan dan ?version=; "Batalkan upload" → versi hilang, versi aktif sama. Buang otomatis
  > 7 hari = expireAwaitingConfirm T-052 (unit), layar menampilkan tanggalnya.
- AC5: e2e xlsx dua sheet (Pengiriman, Retur), file hanya Pengiriman → "Sheet “Retur” tidak ada di file
  ini: Pertahankan data lama sheet itu", baris Februari per sheet.
- Asumsi: centang "dilepas" untuk periode yang dilepas karena batas hanya di klien (server tidak punya
  ack evict; sidik sudah mengunci rencana). Skema berubah sejak diproses → tombol "Proses ulang dengan
  skema terbaru" (memakai jalur Terapkan T-052 yang memproses ulang); jalur ini belum punya e2e.
- Review putaran 1 (0 blokir): M1 banner pratinjau menyebut "isi file dengan pilihan bawaan, bukan hasil
  akhir"; M2 tabel ber-role table/rowgroup/row/columnheader/cell, label "Sekarang:/Setelah:" ponsel tidak
  disembunyikan dari pembaca layar; L1 radio nyasar memakai aria-disabled (fokus tetap, e2e toBeFocused);
  L2 alasan Terapkan nonaktif selalu di live region + aria-describedby fieldset Konfirmasi; L3 lihat bawah.
- PERHATIAN T-058: pada sheet berlabel Segment.minDate/maxDate = rentang kolom tanggal ACUAN, bukan rentang
  periode — pemangkasan tidak boleh memakainya sebagai rentang `_period` (dicatat di kode + Notes T-058).
- frontend-expert plugin tidak tersedia di sesi cloud: pola UI mengikuti period-setup-form/version-history
  (token, Tabler, kartu < md, CTA 44 px); diperiksa axe + tangkapan layar desktop/360 px.

## Security checklist (OWASP ASVS 4.0.3)
<!-- Check each item when verified, or write "N/A: <reason>" after the text and check it. -->
- [x] V1 Architecture: trust boundaries and the components handling sensitive data are identified for this change — halaman server (periodReviewPage, gridPageView) + Server Action T-052; klien hanya menampilkan rencana dan mengirim include/digest/ack.
- [x] V2 Authentication: credentials are verified server-side; no default, hard-coded, or weak secrets — N/A: tidak mengubah autentikasi; halaman memanggil requireUser().
- [x] V3 Session management: session tokens are random, protected, invalidated on logout and expiry — N/A: tidak mengubah sesi.
- [x] V4 Access control: every endpoint/action checks authorization server-side, deny by default (no IDOR) — tinjauan: dataset ownerId = user, versi harus milik dataset itu; ?version= hanya pemilik (editor → 404); e2e pengguna lain → 404 untuk keduanya; endpoint grid tetap authorizeGrid.
- [x] V5 Validation, sanitization and encoding: all input validated; output encoded; no injection (SQL, OS, template) — id dicek isIdShape; payload lewat zod T-052; SQL min/max kolom acuan memakai identifier dari skema (typedParts) + lit() path, tanpa input user; React meng-escape teks.
- [x] V6 Stored cryptography: sensitive data at rest uses approved algorithms; keys are not in the code — N/A: tidak ada data rahasia baru.
- [x] V7 Error handling and logging: errors reveal no internals; security events are logged without secrets — galat lewat versionErrorText (pesan server Indonesia T-052); AuditLog dataset.period.confirm tetap dari T-052.
- [x] V8 Data protection: personal/sensitive data is minimized, not cached or logged, and removable — pratinjau hanya untuk pemilik; versi dibuang = data dibersihkan job T-052.
- [x] V9 Communication: TLS for all external traffic; certificates validated — N/A: tanpa lalu lintas eksternal baru.
- [x] V10 Malicious code: no backdoors, time bombs, or unexplained network calls; dependencies are trusted — tanpa dependensi baru (yazl dan axe-core sudah ada, hanya di tes).
- [x] V11 Business logic: flows cannot be abused (limits, ordering, replay, race conditions) — Terapkan mengirim sidik rencana yang tampil (beda → PLAN_STALE, e2e); centang menyusut/buang baris ditegakkan server; tombol dinonaktifkan selama permintaan; batal = deleteMany berstatus di bawah lock (T-052).
- [x] V12 Files and resources: uploads are type/size limited and stored safely; no path traversal or SSRF — N/A: jalur unggah tidak berubah.
- [x] V13 API and web service: API inputs/outputs are schema-validated; CORS and rate limits are deliberate — memakai Server Action T-052 (zod + rate limit query/versionChange); tidak ada endpoint baru.
- [x] V14 Configuration: secure defaults, security headers, no debug in production, dependencies up to date — N/A: tanpa konfigurasi baru; memakai PERIOD_CONFIRM_TTL_HOURS yang ada.

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm run check` → exit 0 at 2026-10-20T15:18:38Z (197037 ms)
- Acceptance criteria: 5/5 satisfied
- Commits: 08ca5b4, 0cb153a, 1220871, 14bbbc8, 17d81a7, 18b74cc, 1b2b9ab, 23e5ae9, 258a139, 27924c4, 27986dc, 29fe0f3, 2d7b316, 337259e, 3602b55, 36afc9f, 3b96186, 3bb3baa, 49f49a5, 4bd9881, 4e9a95e, 4eea84c, 5101f51, 538221d, 5603fc7, 56a8447, 56e4d6d, 59ec9a3, 6123427, 62ec216, 686497c, 69b8953, 6a7cef1, 6b3ee3f, 70136f5, 7187327, 75cf456, 76e3ce7, 7824e56, 7ae2840, 7af4484, 7d64743, 7f238c4, 7f9a7c7, 8570e80, 8f8df38, 8fc3abc, 90e4e63, 9159d7c, 9298e14, 930dd6d, 94bea50, 94d85a4, 9bd7e54, a019f8f, a03481c, a0e1646, a687d4c, a8f9162, acb27a6, ae4e5a2, af1994a, b0b99d8, b30aea5, b32d50d, b42141b, b8e59ee, b933279, ba2efef, bafb4ad, c15362c, c1c8b0a, c2fd95c, c3626c9, c76c343, ca5782f, ccd0a9a, ce26ca5, ce5d6a7, ce649d0, cf28ad3, cf730c5, d32a8ea, d4c2029, d557c9e, da46e35, dfc2ebb, dff9b8c, e24e070, e51fcb4, f197114, f3ea697, f54828c, f55d8d2, f5b2aa6, f87b0a1, f9d43c6, fc288cb, fc87996
- Review pass 1 by claude-reviewer-subagent: 5 findings
- Review pass 2 by claude-code: 0 findings
