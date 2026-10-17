---
id: T-de1b
title: Parse sheet xlsx paralel saat ingest
status: todo
profile: standard
created: "2026-10-17T10:12:35Z"
updated: "2026-10-17T12:38:56Z"
created_by: claude-code
review:
  passes:
    - "n": 1
      by: claude-code-reviewer-subagent
      at: "2026-10-17T12:38:55Z"
      findings: 9
    - "n": 2
      by: claude-code-reviewer-subagent
      at: "2026-10-17T12:38:56Z"
      findings: 0
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [x] Given xlsx dengan beberapa sheet besar, when ingest berjalan di worker, then sheet dibaca paralel (dibatasi jumlah thread yang bisa diatur) dan total waktu baca lebih kecil daripada baca berurutan pada fixture perf yang sama
- [ ] Given batas memori worker 3 GB, when xlsx 1 GB 3 sheet di-ingest paralel, then worker tidak OOM dan hasil kolom/tipe sama persis dengan baca berurutan

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

- 2026-10-17T12:38:56Z AC1 terukur di Apple M4 (3×200k×30 & 3×100k): baca 25–45% lebih cepat dengan 2 thread, digest raw/typed parquet + skema identik dengan berurutan. AC2 (1 GB 3 sheet tanpa OOM di 3 GB) belum diukur: perlu perf-ingest pada fixture 1 GB dengan sheetThreads=2 + /usr/bin/time -l (footprint ≤ ~2 GB = bukti; 2–2,6 GB → konfirmasi docker --memory=3g di olympus). Disk Mac 98% penuh; olympus sedang macet.
