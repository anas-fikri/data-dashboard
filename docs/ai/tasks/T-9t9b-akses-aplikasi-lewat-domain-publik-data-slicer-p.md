---
id: T-9t9b
title: Akses aplikasi lewat domain publik data-slicer.pcpexpress.com di belakang Nginx Proxy Manager
status: in_progress
profile: standard
tags:
  - security
created: "2026-10-19T08:48:25Z"
updated: "2026-10-19T08:48:30Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-t-001-scaffold
base: 3bb3baa5bada8f11f6acd698a0497d56871195e3
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given domain data-slicer.pcpexpress.com diteruskan Nginx Proxy Manager ke Caddy, when dibuka di browser, then aplikasi tampil dan bisa login, bukan halaman kosong
- [ ] Given akses lewat domain maupun lewat IP 10.3.3.221:8443, when pengguna login dan mengunggah, then keduanya berjalan (CORS mengizinkan kedua alamat) dan IP pengguna yang tercatat bukan IP proxy

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
