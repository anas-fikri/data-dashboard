---
status: accepted
date: 2026-10-16
---

# ADR-0006: Renderer PDF: dipanggil worker, jaringan render, token → cookie

## Context and Problem Statement

T-018 mengekspor dashboard utuh ke PDF lewat renderer Chromium terpisah. Dokumen awal (flow-kerja B1) menulis renderer "dipanggil app", "hanya di network frontend", dan menyimpan sendiri ke `exports/`. Investigasi T-018 (probe playwright-core 1.64.0) menemukan:

* Renderer di network `frontend` tetap bisa menjangkau object storage, karena RustFS juga ada di `frontend` (compose dev) dan reverse proxy produksi harus menjangkau storage.
* Render di app tidak punya ulang/stall recovery dan bersaing dengan DuckDB app (4 GB); restart app menghilangkan render yang sedang berjalan.
* Token di URL halaman (`/render/<token>`) ikut tersimpan di riwayat, Referer, dan log.
* `route.continue()` mengikuti redirect 3xx ke origin lain (allowlist bisa dilewati), `upgrade-insecure-requests` mematahkan script di origin http internal non-loopback, dan host http ber-TLD HSTS preload (`app`, `dev`) selalu dipaksa https oleh Chromium. Ketiganya hanya muncul di produksi (dev memakai localhost).

## Considered Options

* App memanggil renderer di `POST /api/exports` (sinkron atau `after()`), sesuai dokumen awal.
* Worker memanggil renderer lewat antrean BullMQ `pdf` tersendiri; app hanya cek kesehatan renderer saat buat.
* Renderer membaca token dari Redis dan menulis ke storage sendiri.

## Decision Outcome

Chosen option: "Worker memanggil renderer lewat antrean `pdf`", because memakai ulang mesin ekspor T-017 tanpa mengubah bentuknya (baris Export sebagai sumber kebenaran, ulang, stall recovery, unggah, kedaluwarsa 60 menit, pembersihan, polling UI, rute unduh) dan menjaga renderer tanpa akses ke data mana pun.

Rincian yang diputuskan bersama:

* **Pemanggil**: worker, antrean `pdf` sendiri (concurrency 1 per proses) agar PDF tidak menunggu XLSX 10 menit. App mengecek `GET RENDERER_URL/healthz` ≤ 3 detik saat `POST /api/exports` → 503 `RENDERER_UNAVAILABLE` seketika (AC3); worker mengecek lagi sebelum `POST /render`. Renderer penuh (503) → job diulang; gagal final → `RENDERER_UNAVAILABLE`.
* **Jaringan**: network compose `render` (`internal: true`, tanpa egress) berisi renderer + app (+ worker). Renderer tidak di network lain, jadi tidak bisa menjangkau RustFS/Redis/PostgreSQL. Worker yang memeriksa `%PDF-` + `PDF_MAX_BYTES` lalu mengunggah ke `exports/<userId>/<id>.pdf`.
* **Token → cookie**: worker membuat token acak 32 byte; Redis menyimpan hash-nya `render:tok:<sha256>` (SET PX 60000 NX) berisi `{exportId, userId, dashboardId, f, requestedAt}`. Renderer hanya menerima `{token}` + header `x-renderer-secret` (bukan URL), lalu `GET APP_INTERNAL_URL/render/<token>` → GETDEL → sesi `render:sess:<sha256>` dengan sisa umur → 303 `/render` + cookie `dd.render` (Path=/render, HttpOnly, SameSite=Strict, Max-Age ≤ 60, Secure hanya bila APP_INTERNAL_URL https, tanpa awalan `__Secure-`). Halaman `/render` GETDEL sesi (sekali pakai), cek ulang user aktif + ekspor masih RUNNING + akses dashboard, saring filter lagi, dan mengambil data semua widget di SERVER lewat `runWidgetQuery`. Cookie tidak pernah berlaku untuk `/api/*`.
* **Pengerasan halaman render**: CSP per rute tanpa `upgrade-insecure-requests`, tanpa origin storage, `form-action 'none'`; `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`; path `/render/<token>` diredaksi dari pino (nilai string) dan tidak diteruskan sebagai `x-current-path`. `APP_INTERNAL_URL` http tidak boleh ber-TLD HSTS preload (divalidasi env app dan renderer).
* **Allowlist renderer**: hanya origin `APP_INTERNAL_URL` lewat `route.fetch({maxRedirects: 0})`; 3xx dan origin lain dibatalkan (menutup bypass redirect); websocket hanya di dev (HMR).
* **Kontainer renderer**: image `mcr.microsoft.com/playwright:v1.64.0-noble` dipin digest, `user: pwuser` (uid 1001), seccomp profil Playwright v1.64.0 (`renderer/seccomp_profile.json`, asal-usul di `renderer/README.md`), `no-new-privileges`, `read_only` + tmpfs `/tmp`, `cap_drop: ALL` **ditambah `cap_add: SYS_CHROOT`** — tanpa itu sandbox Chromium gagal start (`sys_chroot("/proc/self/fdinfo/")`, profil Playwright hanya mengizinkan chroot bila kapabilitas itu ada, sama dengan profil default Docker); kapabilitas efektif proses tetap 0 dan Chromium tetap dengan sandbox (`chromiumSandbox: true`). Bukti: `docker compose -f docker-compose.dev.yml --profile renderer run --rm renderer sh -c 'id -u; grep Seccomp /proc/self/status'` → `1001`, `Seccomp: 2`.

### Consequences

* Good, because PDF mewarisi seluruh jaminan ekspor T-017 (batas 2 berjalan per user, kedaluwarsa, pembersihan, audit saat unduh) tanpa migrasi.
* Good, because renderer tidak memegang kredensial apa pun selain secret pemanggil, tidak bisa menjangkau data, dan token tidak pernah berada di URL halaman, riwayat, atau Referer.
* Good, because data PDF berasal dari resolver yang sama dengan layar (D6, cache, jam preset = waktu permintaan).
* Bad, because flow-kerja B1, conventions (cakupan worker), dan AC T-023 ("renderer hanya di network frontend") harus diselaraskan; T-023 wajib memakai network `render`, host internal bukan `app`/`dev`, redaksi access log `/render/*`, dan font tetap di image renderer.
* Bad, because worker yang mati membuat PDF tetap QUEUED (sama dengan ekspor T-017); cek kesehatan app hanya menutup kasus renderer mati.
* Bad, because satu render menjalankan semua query widget atas nama user (paralel 2, ulang QUERY_BUSY), sehingga dashboard besar mendekati `RENDER_TIMEOUT_MS`.
