---
id: T-de1b
title: Parse sheet xlsx paralel saat ingest
status: todo
profile: standard
created: "2026-10-17T10:12:35Z"
updated: "2026-10-17T10:12:35Z"
created_by: claude-code
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given xlsx dengan beberapa sheet besar, when ingest berjalan di worker, then sheet dibaca paralel (dibatasi jumlah thread yang bisa diatur) dan total waktu baca lebih kecil daripada baca berurutan pada fixture perf yang sama
- [ ] Given batas memori worker 3 GB, when xlsx 1 GB 3 sheet di-ingest paralel, then worker tidak OOM dan hasil kolom/tipe sama persis dengan baca berurutan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
