---
status: accepted
date: 2026-10-11
---

# ADR-0002: Object storage memakai RustFS (API S3 kompatibel MinIO), bukan MinIO

## Context and Problem Statement

Rencana (ADR-0001, flow-kerja B1–B2) memakai MinIO sebagai object storage on-prem. Saat T-001 dikerjakan (2026-10-11), image `minio/minio` dan `minio/mc` sudah tidak tersedia di Docker Hub, quay.io, maupun GHCR. Satu-satunya salinan yang masih bisa ditarik adalah `bitnamilegacy/minio` (build Mei 2025, beku, tanpa pembaruan keamanan). Aplikasi membutuhkan: presigned multipart upload dari browser dengan `Content-Length` sebagai signed header, `ListParts`, CORS dengan `ExposeHeaders: ETag`, lifecycle `AbortIncompleteMultipartUpload`, `Range` request (206), dan `response-content-disposition` pada presigned GET.

## Considered Options

1. `bitnamilegacy/minio` — lolos uji multipart, tetapi CORS dan lifecycle tidak bisa diatur lewat API S3 (hanya lewat `mc` yang juga tidak tersedia) dan image tidak akan diperbarui.
2. **RustFS** (`rustfs/rustfs`, Apache-2.0, build 2026-10-03) — kompatibel API MinIO/S3; lolos 16/16 uji probe termasuk menolak part yang ukurannya berbeda dari yang ditandatangani (403).
3. SeaweedFS — lolos 15/16; **menerima** part berukuran berbeda dari signed `Content-Length` (200), sehingga batas 1 GB hanya bisa ditegakkan setelah `ListParts`.
4. Garage / Ceph RGW — tidak diuji; Garage tidak punya lifecycle, Ceph terlalu berat untuk satu VM.

## Decision Outcome

Chosen option: "2. RustFS", because: satu-satunya kandidat aktif yang lolos semua kebutuhan termasuk penegakan `Content-Length` bertanda tangan; API dan konsep (bucket, IAM, console 9001) sama dengan MinIO sehingga dokumen yang menyebut "MinIO" tetap berlaku secara semantik. Semua inisialisasi (bucket, CORS, lifecycle) dilakukan lewat API S3 standar dari `scripts/storage-init.mjs`, bukan CLI vendor, sehingga storage dapat diganti lagi tanpa mengubah aplikasi.

Temuan penting dari uji: AWS SDK JS v3 ≥ 3.729 menyisipkan checksum CRC32 (`x-amz-sdk-checksum-algorithm`) ke presigned URL; RustFS dan SeaweedFS menolak dengan `BadDigest`. Klien S3 aplikasi wajib `requestChecksumCalculation: "WHEN_REQUIRED"` dan `responseChecksumValidation: "WHEN_REQUIRED"`.

### Consequences

* Good, because semua kebutuhan B2 terbukti berjalan (probe 16/16), lisensi Apache-2.0, image aktif.
* Good, because inisialisasi storage-agnostik; pindah ke S3 lain = ganti endpoint.
* Bad, because RustFS relatif muda (2025); T-023 wajib menguji ulang presigned lewat reverse proxy dan mengevaluasi IAM RustFS untuk service account berpolicy prefix (least privilege). Di dev, aplikasi memakai akun root RustFS.
* Bad, because dokumen lama menyebut "MinIO"; dibaca sebagai "object storage S3 (RustFS)".
