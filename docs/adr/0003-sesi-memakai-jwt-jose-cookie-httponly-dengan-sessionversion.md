---
status: accepted
date: 2026-10-11
---

# ADR-0003: Sesi memakai JWT jose + cookie HttpOnly dengan sessionVersion, bukan Auth.js

## Context and Problem Statement

Keputusan D1 (flow-kerja) menyebut Auth.js Credentials + JWT dengan klaim `sessionVersion` yang dicocokkan ke DB tiap permintaan. Saat T-002 dikerjakan, kebutuhan nyata ternyata: (1) login email+password argon2id, (2) verifikasi email dengan token sekali pakai, (3) rate limit per IP dan per akun di Redis, (4) pencabutan sesi seketika lewat `sessionVersion`, (5) rotasi `AUTH_SECRET` (array), (6) `requireUser()/requireAdmin()` Node-side yang membaca `isAdmin` dari DB. Auth.js v5 Credentials tidak memberi satu pun dari poin 2–6; ia hanya membungkus JWT + cookie dan menambah konfigurasi callback, provider, dan `proxy.ts` miliknya sendiri yang harus "dilawan" untuk memenuhi D1.

## Considered Options

1. Auth.js v5 (next-auth beta) Credentials + JWT strategy + callbacks untuk `sv`.
2. **JWT sendiri dengan `jose`** (HS256, klaim `sub`, `sv`, `iat`, `exp` 12 jam, `kid` untuk rotasi) + cookie HttpOnly/SameSite=Lax/Secure, verifikasi DB di `getSessionUser()`.
3. Sesi server-side di PostgreSQL/Redis (ID acak di cookie).

## Decision Outcome

Chosen option: "2. JWT sendiri dengan jose", because: permukaan kode kecil (±150 baris), semua syarat D1–D2 terpenuhi secara eksplisit dan bisa diuji unit, tidak bergantung paket beta, dan rotasi secret trivial (verifikasi mencoba semua secret, menandatangani dengan yang pertama). Opsi 3 ditolak untuk v1 karena menambah tabel/round-trip per permintaan padahal pencabutan seketika sudah dicapai dengan cek `sessionVersion` (satu `SELECT` berindeks PK yang memang dibutuhkan untuk membaca `isActive`/`isAdmin`).

D1 diperbarui: "Auth.js Credentials" dibaca sebagai "JWT HS256 (jose) + cookie HttpOnly; `sessionVersion` dicek ke DB tiap permintaan".

### Consequences

* Good, because tidak ada ketergantungan pada Auth.js beta; perilaku 100% terdokumentasi di `src/features/auth/`.
* Good, because cek per permintaan sekaligus mengambil `isAdmin`/`isActive` terbaru (temuan review T-001 #3).
* Bad, because kita bertanggung jawab atas detail (cookie flags, exp, rotasi) tanpa "default aman" pustaka — dimitigasi unit test dan checklist ASVS V2/V3 di T-002.
* Bad, because OAuth/SSO di masa depan harus ditambahkan sendiri (di luar scope: aplikasi internal, registrasi domain terbatas).
