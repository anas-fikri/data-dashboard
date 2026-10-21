---
id: T-z8y2
title: 'Stabilkan e2e dashboards: klik Pengaturan sesaat setelah muat halaman tidak membuka panel'
status: todo
profile: standard
created: "2026-10-21T12:34:25Z"
updated: "2026-10-21T12:34:25Z"
created_by: claude-code
---

## Objective
Ditemukan saat T-1zdf (sudah gagal di HEAD 8ce72cf, 2/2 run): di tests/e2e/dashboards.spec.ts tes "urungkan satu langkah dan ubah posisi tanpa menyeret" (dan kadang "< 1280 px: pengaturan sebagai lembar") mengeklik tombol Pengaturan widget langsung setelah page.goto; panel tidak terbuka (heading "Pengaturan widget" tidak ada). Dengan jeda 3 dtk sebelum klik tes lulus — kemungkinan klik sebelum hydration selesai atau saat grid menata ulang lebar (1280 px bawaan → lebar kanvas). Cari akar masalahnya: bila aplikasi mengabaikan klik pengguna sungguhan di jendela itu, perbaiki aplikasinya; bila hanya tes, tunggu sinyal yang benar (bukan waitForTimeout).

## Acceptance criteria
- [ ] Given dashboards.spec.ts dijalankan utuh dua kali berturut-turut, then semua 11 tes lulus tanpa jeda waktu buatan (waitForTimeout)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
