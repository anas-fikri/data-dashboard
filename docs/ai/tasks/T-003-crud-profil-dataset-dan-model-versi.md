---
id: T-003
title: CRUD profil dataset dan model versi
status: todo
profile: standard
goal: G-2
depends_on:
  - T-002
created: "2026-10-11T14:45:08Z"
updated: "2026-10-11T14:45:08Z"
created_by: claude-code
---

## Objective
Model Dataset {name, description, ownerId, activeVersionId?} dan DatasetVersion {status: UPLOADING|UPLOADED|INGESTING|AWAITING_MAPPING|READY|FAILED, mode: REPLACE|APPEND, sourceKey, etag, sha256?, errorMessage?, ingestFinishedAt?}. Label profil diturunkan (kosong/siap + badge versi terbaru), bukan kolom (B5). Daftar hanya milik user atau yang dibagikan. Hapus = konfirmasi dua langkah; memanggil hook storage.deleteDatasetObjects (diimplementasikan penuh di T-004) dan queue.cancelVersionJobs.

## Acceptance criteria
- [ ] Given user login, when membuat profil dataset dengan nama unik per pemilik, then profil muncul di daftar dengan label kosong
- [ ] Given profil milik user lain yang tidak dibagikan, when user membuka URL-nya langsung atau memanggil Server Action-nya, then halaman 404 / code NOT_FOUND dan tidak ada perubahan
- [ ] Given profil dengan versi READY aktif dan versi terbaru FAILED, when membuka daftar, then label siap dengan badge gagal beserta pesan
- [ ] Given profil dataset, when user menghapus dengan konfirmasi dua langkah, then profil, versi, dan dashboard terkait hilang dan hook penghapusan storage serta pembatalan job terpanggil (diverifikasi test)

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
