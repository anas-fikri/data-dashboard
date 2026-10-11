# Conventions

- Stack and versions: Next.js 15 App Router + TypeScript strict; Node 22 LTS; Prisma + PostgreSQL 16; MinIO (S3); DuckDB via @duckdb/node-api; BullMQ + Redis 7; ECharts; Tailwind; @tabler/icons-react (Lucide hanya fallback, jangan campur dalam satu komponen).
- Structure: `src/app` (routes), `src/features/<domain>` (auth, datasets, ingest, query, dashboards, sharing), `src/lib` (shared infra: db, storage, queue, duckdb), `worker/` (proses ingest terpisah, share `src/lib`), `prisma/` (schema + migrations), `tests/` mirror `src/`.
- Naming and style: ESLint + Prettier default Next; file kebab-case, komponen PascalCase, fungsi camelCase; UI text Bahasa Indonesia, kode & komentar English.
- Errors: Server Actions/API mengembalikan `{ ok: false, code, message }`, tidak melempar ke client; log terstruktur (pino) dengan jobId/datasetId; user melihat pesan Indonesia yang bisa ditindak.
- Data: data tabular di Parquet (object storage), BUKAN di PostgreSQL; metadata di PostgreSQL; waktu UTC di DB, tampil Asia/Jakarta; ID cuid; ukuran file dalam byte; angka uang tetap decimal (DuckDB DECIMAL), jangan float.
- Tests: Vitest (unit + integration), Playwright (e2e jalur kritis); setiap fitur punya test terhadap fixture Excel beragam di `tests/fixtures/`; perf test 1 GB disintesis, tidak di-commit; jalankan `npm run check` (lint + typecheck + test).
- Security: auth session (Auth.js) + registrasi whitelist domain + verifikasi email; semua akses dataset/dashboard dicek kepemilikan/role di server; validasi upload (ekstensi, magic bytes, ukuran ≤ 1 GB) di server; query hanya dari spec yang divalidasi (zod) → parameter binding, tidak ada SQL dari client; secrets hanya env.
- Git and versioning: Conventional Commits; aitk release for versions and the changelog
- UI consistency: Tabler icons `size={20} stroke={1.5}`; token warna Tailwind di `tailwind.config`; layout dashboard pakai grid 12 kolom; jangan hardcode warna hex di komponen.
