# Renderer PDF (T-018)

Proses terpisah dari app dan worker yang mencetak dashboard ke PDF A4 landscape dengan Chromium
(playwright-core). Worker memanggilnya dengan `POST /render {token}` + header `x-renderer-secret`;
renderer sendiri yang membuka `APP_INTERNAL_URL/render/<token>` (tidak pernah menerima URL), lalu
mengembalikan PDF. Worker yang memeriksa `%PDF-` + `PDF_MAX_BYTES` dan mengunggah ke storage; renderer
tidak punya akses ke PostgreSQL, Redis, atau object storage.

| Berkas                 | Isi                                                                              |
| ---------------------- | -------------------------------------------------------------------------------- |
| `server.ts`            | Entry: env, Chromium (sandbox aktif), listen, berhenti rapi pada SIGTERM/SIGINT. |
| `renderer.ts`          | Server `node:http` + job render (context baru per job, allowlist rute).          |
| `render.ts`            | Helper murni: validasi body, cek secret, allowlist URL, keputusan rute.          |
| `env.ts`               | Env renderer sendiri (zod); tidak mengimpor `src/lib/env.ts`.                    |
| `loader.mjs`           | Hook resolve untuk type stripping Node di container (tanpa tsx).                 |
| `seccomp_profile.json` | Profil seccomp Playwright (vendored, lihat Provenance).                          |

## Env

| Variabel                  | Default     | Keterangan                                                                                                                                                                                                              |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RENDERER_SECRET`         | —           | Wajib, ≥ 32 karakter, sama dengan milik worker. Produksi menolak placeholder `change-me`.                                                                                                                               |
| `APP_INTERNAL_URL`        | —           | Wajib. Origin app saja (`http://host:port`). Host http yang dipaksa https oleh HSTS preload Chromium ditolak (`app`, `dev`, `page`, `foo`, `*.app`, …; daftar di `env.ts`). Pakai nama service seperti `dashboard-web`. |
| `RENDERER_HOST`           | `127.0.0.1` | `0.0.0.0` di container.                                                                                                                                                                                                 |
| `RENDERER_PORT`           | `3200`      |                                                                                                                                                                                                                         |
| `RENDERER_CONCURRENCY`    | `1`         | 1–2 job bersamaan; penuh → 503 `RENDERER_BUSY`.                                                                                                                                                                         |
| `RENDER_READY_TIMEOUT_MS` | `30000`     | Batas tukar token + navigasi + tunggu `data-render-ready="1"`.                                                                                                                                                          |
| `ALLOW_DEV_WEBSOCKET`     | `false`     | Dev saja (ditolak di produksi): WebSocket same-origin (HMR `next dev`) diteruskan. Tanpa ini WebSocket same-origin ditutup; lintas origin selalu menggagalkan job.                                                      |

## Kontrak HTTP

- `GET /healthz` → `200 {"ok":true}` bila Chromium tersambung, `503 {"ok":false}` bila belum/berhenti.
- `POST /render`, `content-type: application/json`, body ≤ 1 KB, persis `{"token":"<43 karakter base64url>"}`.
  - `200 application/pdf` (A4 landscape, `printBackground`, `preferCSSPageSize`, footer "Halaman X dari Y").
  - Error: body `{"ok":false,"code":…}`, urutan cek: metode → secret → ukuran → body → slot.

| Status | `code`                                   | Arti                                                                     | Peta worker            |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| 401    | `UNAUTHORIZED`                           | `x-renderer-secret` hilang/salah (dicek sebelum body dibaca)             | `EXPORT_FAILED`        |
| 400    | `BAD_REQUEST`                            | JSON rusak, token salah bentuk, kunci lain (mis. `url`)                  | `EXPORT_FAILED`        |
| 413    | `PAYLOAD_TOO_LARGE`                      | Body > 1 KB                                                              | `EXPORT_FAILED`        |
| 415    | `UNSUPPORTED_MEDIA_TYPE`                 | Bukan `application/json`                                                 | `EXPORT_FAILED`        |
| 404    | `NOT_FOUND`                              | Path lain                                                                | —                      |
| 405    | `METHOD_NOT_ALLOWED`                     | Metode salah (`Allow` diisi)                                             | —                      |
| 502    | `RENDER_TOKEN_REJECTED`                  | `GET /render/<token>` tidak 303 ke `/render` (token dipakai/kedaluwarsa) | `EXPORT_FAILED`        |
| 502    | `RENDER_BLOCKED`                         | Ada permintaan ke origin lain, respons 3xx, atau WebSocket lintas origin | `EXPORT_FAILED`        |
| 502    | `RENDER_FAILED`                          | `/render` bukan 200, app tidak terjangkau, atau galat lain               | `EXPORT_FAILED`        |
| 503    | `RENDERER_BUSY` / `RENDERER_UNAVAILABLE` | Slot penuh / Chromium belum tersambung atau renderer berhenti            | `RENDERER_UNAVAILABLE` |
| 504    | `RENDER_TIMEOUT`                         | `data-render-ready="1"` tidak muncul dalam `RENDER_READY_TIMEOUT_MS`     | `EXPORT_TIMEOUT`       |

Setiap respons membawa `x-request-id`. Log satu baris JSON per `POST /render` berisi hanya
`{requestId, ms, bytes, outcome}`; token, URL, dan pesan error tidak pernah ditulis.

## Alur satu job

1. Context baru: viewport 1047×740, `reducedMotion: reduce`, `colorScheme: light`, `id-ID`,
   `Asia/Jakarta`, service worker diblokir, unduhan mati; `emulateMedia({media: "print"})`.
2. `context.route("**/*")`: hanya origin `APP_INTERNAL_URL`, diambil dengan `route.fetch({maxRedirects: 0})`;
   respons 3xx dan origin lain di-abort **dan menggagalkan job** (fail closed). `route.continue()` sengaja
   tidak dipakai: redirect same-origin → origin lain tidak melewati route lagi (terbukti di probe T-018).
   `data:`/`blob:` tidak pernah keluar jaringan (tidak melewati route). WebSocket diblokir kecuali
   `ALLOW_DEV_WEBSOCKET` (same-origin saja).
3. `context.request.get(APP_INTERNAL_URL/render/<token>, maxRedirects 0)` → wajib 303; cookie
   `dd.render` (Path=/render) masuk jar context. Token tidak pernah ada di URL halaman, riwayat, atau Referer.
4. `page.goto(APP_INTERNAL_URL/render)` → wajib 200; tunggu `html[data-render-ready="1"]` (selector di dunia
   utilitas Playwright, tidak butuh `unsafe-eval` di CSP halaman).
5. `page.pdf(...)`, context ditutup di `finally`. Pemanggil memutus koneksi → context ditutup segera.

Chromium diluncurkan dengan `chromiumSandbox: true` dan env allowlist (`PATH`, `HOME`, `LANG`, `XDG_*`, …),
jadi `RENDERER_SECRET` dan secret app di `.env` dev tidak ikut ke proses peramban.

## Menjalankan

Dev (host, dipakai worker dan e2e): `.env` berisi `RENDERER_SECRET` (sama dengan app/worker) dan
`APP_INTERNAL_URL=http://localhost:3100`, lalu

```sh
npm run renderer            # siap saat log "renderer berjalan"
```

Untuk `next dev` tambahkan `ALLOW_DEV_WEBSOCKET=true` agar klien HMR tidak memutus/memuat ulang halaman.
Chromium berasal dari `npx playwright install chromium` (revisi sama dengan playwright-core 1.64.0).

Container (profil `renderer`, tidak ikut `npm run compose:up`): image Playwright yang di-pin, user
`pwuser`, `seccomp=./renderer/seccomp_profile.json`, `no-new-privileges`, `cap_drop: ALL` + hanya
`cap_add: SYS_CHROOT`, root filesystem read-only + tmpfs `/tmp`, `mem_limit: 2g`, hanya jaringan internal
`render`. Kode dipasang read-only dan dijalankan dengan type stripping Node (`loader.mjs`), tanpa tsx.
Di dev jaringan `render` tidak berisi app (app berjalan di host), jadi container ini untuk bukti AC6 dan
dasar T-023, bukan untuk render harian.

Kenapa `SYS_CHROOT`: profil seccomp Playwright (seperti profil default Docker) hanya mengizinkan syscall
`chroot` bila container memegang `CAP_SYS_CHROOT`. Dengan `cap_drop: ALL` saja, sandbox Chromium gagal
start (`Check failed: sys_chroot("/proc/self/fdinfo/") == 0`, zygote exit). Proses tetap non-root:
`CapEff` 0, `CapBnd` hanya bit SYS_CHROOT (`0x40000`), `NoNewPrivs: 1`.

Bukti AC6 (non-root + seccomp):

```sh
docker compose -f docker-compose.dev.yml --profile renderer run --rm renderer \
  sh -c 'id -u; grep Seccomp /proc/self/status'
```

Hasil 2026-10-16 (OrbStack, linux/arm64):

```text
1001
Seccomp:	2
Seccomp_filters:	1
```

(`Seccomp: 2` = mode filter, profil terpasang; uid 1001 = `pwuser`.) Di container yang sama, renderer
sungguhan (entry `server.ts`, `chromiumSandbox: true`) menghasilkan `200 application/pdf` (`%PDF-`)
terhadap app tiruan; semua proses Chromium uid 1001, `Seccomp: 2`, `NoNewPrivs: 1`, tanpa `--no-sandbox`.

## Provenance

- `seccomp_profile.json`: <https://github.com/microsoft/playwright/blob/v1.64.0/utils/docker/seccomp_profile.json>
  (tag `v1.64.0` = commit `606ecd8b34bac100db32561b6278ffd76e5eb3cd`; berkas terakhir diubah di commit
  `ae935a43d9e376e4759548f6b3c6905c7b282333`, 2021-01-03). Diunduh 2026-10-16 dari
  `raw.githubusercontent.com`; sha256 upstream `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`.
  Di repo diformat ulang oleh Prettier (spasi saja; isi JSON identik). Cek ulang:

  ```sh
  curl -fsSL https://raw.githubusercontent.com/microsoft/playwright/v1.64.0/utils/docker/seccomp_profile.json \
    | node -e 'const fs=require("fs");const a=JSON.stringify(JSON.parse(fs.readFileSync(0,"utf8")));const b=JSON.stringify(JSON.parse(fs.readFileSync("renderer/seccomp_profile.json","utf8")));console.log(a===b?"identik":"BERBEDA")'
  ```

- Image `mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f`
  (index multi-arch: amd64 `sha256:bc72a8df…`, arm64 `sha256:4109b399…`), di-resolve 2026-10-16 dengan
  `docker buildx imagetools inspect`. Berisi Node 24.21 dan `chromium_headless_shell-1248`.
- Saat menaikkan Playwright, ubah bersamaan: `playwright-core` (exact) di `package.json`, tag + digest
  image di `docker-compose.dev.yml`, dan `seccomp_profile.json` dari tag yang sama.
