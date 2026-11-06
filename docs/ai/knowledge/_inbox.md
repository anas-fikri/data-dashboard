# Knowledge inbox

<!-- New entries land here; `aitk knowledge compact` files them by topic. -->

- Tag image rilis harus diturunkan/dicek dari versi kode yang dibangun; tag eksplisit bebas pernah membuat image v1.8.1 berisi kode 1.8.0. <!-- aitk:k date=2026-11-06 task=T-jd1g tags=deploy -->
- Context.Provider dari modul 'use client' tidak bisa dipakai langsung di server component (Provider = undefined di referensi klien, error 'Element type is invalid') — bungkus dalam komponen client (DashboardColorsProvider). Field spec yang menyimpan posisi kolom (columns, formatColumns, status[].column) harus ikut dipetakan di remap.ts saat ganti data. <!-- aitk:k date=2026-11-06 task=T-z1vv tags=ui -->
