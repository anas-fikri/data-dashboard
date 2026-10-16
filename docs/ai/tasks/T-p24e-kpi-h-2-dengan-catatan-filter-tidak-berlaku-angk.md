---
id: T-p24e
title: 'KPI h=2 dengan catatan filter tidak berlaku: angka terpotong setengah di kartu lebar'
status: todo
profile: standard
goal: G-4
tags:
  - bug
created: "2026-10-16T01:58:55Z"
updated: "2026-10-16T02:17:53Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given kartu KPI tinggi 2 baris grid lebar 3–12 kolom dengan catatan 'filter tidak berlaku' atau kolom kosong, when dashboard dibuka di 1024/1440/1920 px dan diekspor PDF, then angka KPI tampil utuh di dalam kartu (tidak terpotong)
- [ ] Given kartu KPI tanpa catatan, when dibuka di ukuran yang sama, then ukuran angka tidak mengecil dibanding sebelumnya

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
- 2026-10-16T01:59:03Z Ditemukan review T-018 r3 (integrity): layar 1440/1920 px, kartu KPI h=2 lebar ≥ 3 kolom + baris catatan h-6 'N filter tidak berlaku' → angka KPI (ukuran font container query besar) terpotong setengah; kartu sempit/tanpa catatan aman. PDF ikut terpotong bila judul 2 baris. Sumber: src/components/widgets/kpi-view.tsx (ukuran angka hanya dari lebar container, tidak memperhitungkan tinggi sisa). Arah perbaikan: batasi ukuran angka juga oleh tinggi (cqh / min(cqw,cqh)) atau ukur sisa tinggi.
- 2026-10-16T02:17:53Z Perbaikan akar masuk di commit 978656b (fix review T-018 r3): kpiHeightPx + chooseKpi(maxPx) — ukuran angka dibatasi tinggi kotak (layar + cetak). Terukur 1440 px filter Cabang: 5 KPI h=2 bercatatan utuh di 20 px (sebelum: 36 px terpotong 13,4 px); KPI tanpa catatan tetap 36 px. Sisa untuk task ini: tes regresi layar (e2e 1024/1440/1920) lalu close.
