---
id: T-014
title: Pemetaan kolom saat skema versi baru tidak cocok
status: in_review
profile: standard
goal: G-5
depends_on:
  - T-013
created: "2026-10-11T14:45:09Z"
updated: "2026-10-14T23:19:24Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: d03c1fa28b220019d844fc3fc017ed63278c1074
review:
  passes:
    - "n": 1
      by: claude-verify-workflow
      at: "2026-10-14T18:25:26Z"
      findings: 15
    - "n": 2
      by: frontend-expert-design-reviewer
      at: "2026-10-14T23:02:28Z"
      findings: 13
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 35091
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

      {"level":40,"time":1792019944863,"service":"data-dashboard","check":"B","detail":"koneksi ditolak","msg":"health check gagal"}
      {"level":40,"time":1792019944886,"service":"data-dashboard","check":"Lambat","detail":"Lambat: timeout 20 ms","msg":"health check gagal"}

       Test Files  68 passed (68)
            Tests  1012 passed (1012)
         Start at  06:19:00
         Duration  23.49s (tests 84%, import 10%, transform 6%)


      > data-dashboard@0.1.0 audit
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      found 0 vulnerabilities
    at: "2026-10-14T23:19:24Z"
    tree: 81f4cadd98a1cf7d429519efddaf011b30e879659a30da9d8eff285557f22bbc
---

## Objective
Versi refresh dengan kolom skema aktif yang tidak ditemukan atau cast < 98% → AWAITING_MAPPING. UI: petakan kolom baru → kolom lama, konfirmasi NULL untuk kolom hilang, kolom baru masuk tersembunyi. Simpan → re-cast typed versi baru dari raw-nya dengan skema hasil pemetaan → READY + aktif. Sampai selesai, versi aktif lama tetap tampil.

## Acceptance criteria
- [ ] Given file baru dengan satu kolom berganti nama, when ingest selesai, then versi AWAITING_MAPPING, dashboard masih menampilkan versi lama, dan UI menunjukkan kolom yang tidak ditemukan
- [ ] Given user memetakan kolom baru ke kolom lama dan menyimpan, when re-cast selesai, then versi READY dan aktif tanpa membaca file asli
- [ ] Given kolom skema aktif hilang di file baru dan user mengonfirmasi NULL, when aktif, then widget yang memakai kolom itu menampilkan nilai kosong, bukan error
- [ ] Given file baru punya kolom tambahan, when aktif, then kolom itu ada di skema sebagai hidden dan bisa ditampilkan dari halaman skema
- [ ] Given halaman/komponen task ini selesai, when /frontend-expert:audit dijalankan (anti-slop-design, responsive 320/768/1024/1440, accessibility), then tidak ada temuan Critical/High dan blok Conventions check (Tokens: preset project; Icons: waiver @tabler/icons-react; States loading/empty/error; Responsive; A11y) dicatat sebagai note task

## Risk
- Impact: versi AWAITING_MAPPING (T-013) kini bisa diselesaikan: halaman /datasets/[id]/pemetaan, job map-version di
  antrean recast, commit + aktivasi versi, kolom NULL fisik (absent) yang ikut dibawa refresh/recast berikutnya,
  query widget menandai kolom kosong. Salah pemetaan = widget menampilkan kolom keliru; salah commit = versi aktif
  berganti tanpa persetujuan.
- Security (STRIDE): Spoofing/Elevation — aksi & route status hanya pemilik (NOT_FOUND bagi yang lain). Tampering —
  semua keputusan divalidasi server (status, base snapshot di bawah FOR UPDATE, satu-ke-satu, rentang posisi, batas
  16 384 kolom); worker hanya membaca raw.parquet milik versi itu. Repudiation — AuditLog dataset.version.map.
  Info disclosure — contoh nilai hanya ke pemilik. DoS — rate limit versionChange, satu job per versi (indeks Redis),
  payload hanya keputusan.
- Rollback: revert commit T-014; tanpa migrasi. Kolom absent di skema yang sudah aktif tetap terbaca kode lama sebagai
  kolom biasa (parquet punya kolom NULL bertipe).
- Validation: unit test pemetaan/validasi/kolom absent/carry-forward/recast; e2e: ganti nama kolom → petakan → aktif
  tanpa file asli (AC1–2), kolom hilang → kosongkan → widget "(kosong)" (AC3), kolom tambahan tersembunyi lalu
  ditampilkan di Skema (AC4); review 3 lensa sampai 0 temuan; audit frontend-expert (AC5).

## Notes

- 2026-10-14 Keputusan desain T-014 (standar, diambil lead; kontrak lengkap di tmp kerja): (1) isu dihitung ulang di app
  dari Sheet versi + skema aktif terkini; writeTyped menyimpan nonEmpty agar % cast tepat. (2) Keputusan per kolom aktif
  yang tampil dan hilang: kolom baru (satu-ke-satu) atau kosongkan (NULL); kolom aktif tersembunyi yang hilang tetap
  dibuang. Sheet aktif tanpa pasangan: pasangkan dengan sheet baru yang belum berpasangan, atau tidak dipakai lagi.
  (3) Kolom dipetakan mewarisi nama/tipe/format aktif; judul asli tetap judul file baru. (4) Kolom NULL = kolom fisik
  bertipe di akhir sheet, absent: true, judul asli = judul aktif; refresh berikutnya membawanya otomatis, recast
  mempertahankannya. (5) Job map-version di antrean recast; versi tetap AWAITING_MAPPING selama diterapkan; skema aktif
  berubah → STALE, pengguna memuat ulang. (6) Commit: FOR UPDATE, READY + aktivasi dengan peta sheet (widget ikut sheet
  yang ganti nama), audit dataset.version.map. (7) Widget menampilkan "(kosong)" + catatan untuk kolom absent.

- 2026-10-11T14:49:25Z UI wajib lewat rantai frontend-expert: design-foundations → tokens (preset dari T-025) → (+forms/data-fetching/app-shell sesuai kebutuhan) → components → anti-slop-code → responsive → motion ringan → anti-slop-design → polish → accessibility. Skip design-direction karena arah sudah dipilih di T-025, kecuali layar baru yang ambigu. Chart via skill dataviz; filter/select pakai Select kustom dari T-025, bukan native.
