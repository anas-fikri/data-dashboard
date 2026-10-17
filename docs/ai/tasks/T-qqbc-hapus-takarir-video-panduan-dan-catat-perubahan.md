---
id: T-qqbc
title: Hapus takarir video panduan dan catat perubahan media video di audit
status: todo
profile: standard
depends_on:
  - T-j9j6
created: "2026-10-17T11:09:53Z"
updated: "2026-10-17T11:09:53Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given video bertakarir, when admin memilih Hapus takarir di editor, then objek .vtt dihapus, captionKey dikosongkan, dan pemutar tidak lagi menampilkan tombol takarir
- [ ] Given admin menambah/mengganti/menghapus takarir atau poster, when tersimpan, then AuditLog mencatat aksi guide.video.* dengan {videoId, articleId} tanpa isi file

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
