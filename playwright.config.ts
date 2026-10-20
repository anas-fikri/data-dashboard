import { defineConfig } from "@playwright/test";

// E2E jalur kritis. Dijalankan terpisah (npm run test:e2e) karena butuh compose dev dan server.
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 30_000,
  // Dev server (Turbopack) di mesin bersama: Server Action/route kadang > 5 s saat beban tinggi.
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  // Urutan antar-project dijamin lewat dependencies (urutan nama file tidak menjamin saat paralel):
  //  - ingest: menyalakan worker sungguhan yang mengambil semua job di antrean; bila berjalan bersama
  //    spec lain, job milik spec unggah ikut diproses (status bukan lagi UPLOADED) dan beban DuckDB
  //    memperlambat server;
  //  - schema: menyalakan worker sendiri setelah unggahan pertama (status "menunggu" diamati), jadi
  //    setelah ingest selesai dan worker-nya berhenti;
  //  - rate-limit: mengisi bucket login IP 'local' (dev tanpa proxy), jadi paling akhir.
  projects: [
    {
      name: "e2e",
      testIgnore: [
        /zz-rate-limit\.spec\.ts$/,
        /ingest\.spec\.ts$/,
        /schema\.spec\.ts$/,
        /recast-segments\.spec\.ts$/,
        /grid\.spec\.ts$/,
        /data-view(-scroll|-query|-copy|-export|-a11y)?\.spec\.ts$/,
        /widgets\.spec\.ts$/,
        /admin\.spec\.ts$/,
        /backup\.spec\.ts$/,
        /smtp\.spec\.ts$/,
        /filters\.spec\.ts$/,
        /versions\.spec\.ts$/,
        /mapping\.spec\.ts$/,
        /sharing\.spec\.ts$/,
        /exports\.spec\.ts$/,
        /pdf\.spec\.ts$/,
        /kpi-fit\.spec\.ts$/,
        /chart-polish\.spec\.ts$/,
        /pivot\.spec\.ts$/,
        /guide-roles\.spec\.ts$/,
        /period-setup\.spec\.ts$/,
      ],
    },
    // guide-roles (T-022, T-exfc): menerbitkan artikel bersamaan dengan guides.spec mengubah urutan daftar
    // admin yang diuji guides.spec (review AC5) → dijalankan setelah proyek e2e selesai.
    { name: "guide-roles", testMatch: /guide-roles\.spec\.ts$/, dependencies: ["e2e"] },
    { name: "ingest", testMatch: /ingest\.spec\.ts$/, dependencies: ["guide-roles"] },
    { name: "schema", testMatch: /schema\.spec\.ts$/, dependencies: ["ingest"] },
    // widgets: menyalakan worker sendiri untuk ingest fixture (setelah worker schema berhenti).
    // T-040: worker sendiri + ingest besar → sendirian, setelah schema.
    {
      name: "recast-segments",
      testMatch: /recast-segments\.spec\.ts$/,
      dependencies: ["schema"],
    },
    // T-041: jendela baris Lihat data (worker sendiri untuk ingest fixture kecil).
    { name: "grid", testMatch: /grid\.spec\.ts$/, dependencies: ["recast-segments"] },
    // T-043: halaman Lihat data (worker sendiri; unggah versi kedua untuk banner versi berganti).
    { name: "data-view", testMatch: /data-view\.spec\.ts$/, dependencies: ["grid"] },
    // T-044: urut/saring/cari Lihat data (worker sendiri untuk fixture 60 baris).
    {
      name: "data-view-query",
      testMatch: /data-view-query\.spec\.ts$/,
      dependencies: ["data-view"],
    },
    // T-043 / ADR-0007: mekanika gulir 10 jt baris (respons baris sintetis) di tiga engine. Firefox dan
    // WebKit: `npx playwright install firefox webkit` (+ install-deps di Linux).
    // T-045: Isi sel, salin ke Excel, ringkasan kolom (worker sendiri untuk fixture 1.200 baris).
    {
      name: "data-view-copy",
      testMatch: /data-view-copy\.spec\.ts$/,
      dependencies: ["data-view-query"],
    },
    // T-046: Unduh tampilan (worker sendiri dengan EXPORT_MAX_ROWS=500 untuk batas baris).
    {
      name: "data-view-export",
      testMatch: /data-view-export\.spec\.ts$/,
      dependencies: ["data-view-copy"],
    },
    // T-048: ponsel 360 px, keyboard, ARIA + axe (worker sendiri untuk fixture 450 baris).
    {
      name: "data-view-a11y",
      testMatch: /data-view-a11y\.spec\.ts$/,
      dependencies: ["data-view-export"],
    },
    {
      name: "data-view-scroll",
      testMatch: /data-view-scroll\.spec\.ts$/,
      dependencies: ["data-view-a11y"],
    },
    {
      name: "data-view-scroll-firefox",
      testMatch: /data-view-scroll\.spec\.ts$/,
      use: { browserName: "firefox" },
      dependencies: ["data-view-scroll"],
    },
    {
      name: "data-view-scroll-webkit",
      testMatch: /data-view-scroll\.spec\.ts$/,
      use: { browserName: "webkit" },
      dependencies: ["data-view-scroll-firefox"],
    },
    { name: "widgets", testMatch: /widgets\.spec\.ts$/, dependencies: ["data-view-scroll-webkit"] },
    // admin: juga menyalakan worker sendiri (dataset + KPI sungguhan untuk uji alih kepemilikan).
    { name: "admin", testMatch: /admin\.spec\.ts$/, dependencies: ["widgets"] },
    // backup (T-7psf) + smtp (T-byys): status.json / smtp.json di folder dev bersama berlaku untuk semua
    // admin / semua email dev → tidak bersamaan dengan spec lain.
    { name: "backup", testMatch: /(backup|smtp)\.spec\.ts$/, dependencies: ["admin"] },
    // filters (T-012): worker sendiri untuk fixture 5.000 baris (slicer, preset tanggal, filter silang).
    { name: "filters", testMatch: /filters\.spec\.ts$/, dependencies: ["backup"] },
    // versions (T-013): worker sendiri; ganti data, retensi, rollback, dan job maintenance sungguhan.
    { name: "versions", testMatch: /versions\.spec\.ts$/, dependencies: ["filters"] },
    // mapping (T-014): worker sendiri; ganti nama/hilang/tambah kolom → pemetaan → versi aktif.
    { name: "mapping", testMatch: /mapping\.spec\.ts$/, dependencies: ["versions"] },
    // sharing (T-016): worker sendiri; pemilik, viewer, organisasi, editor, dan orang asing di atas
    // dataset sungguhan (query widget, pencabutan di tengah sesi, AuditLog, hapus dataset).
    { name: "sharing", testMatch: /sharing\.spec\.ts$/, dependencies: ["mapping"] },
    // exports (T-017): worker sendiri (antrean export); CSV/XLSX dari filter + urutan layar, batas baris
    // (worker kedua dengan EXPORT_MAX_ROWS kecil), kedaluwarsa + pembersihan, unduh pemilik/orang lain.
    { name: "exports", testMatch: /exports\.spec\.ts$/, dependencies: ["sharing"] },
    // pdf (T-018): worker sendiri (antrean pdf) + renderer sendiri (npm run renderer, dimatikan untuk AC3
    // lalu dinyalakan lagi); PDF 6 widget = layar, token render sekali pakai, peran, AuditLog.
    { name: "pdf", testMatch: /pdf\.spec\.ts$/, dependencies: ["exports"] },
    // kpi-fit (T-p24e): worker sendiri (workbook 2 sheet); angka KPI h=2 bercatatan di layar + halaman cetak.
    { name: "kpi-fit", testMatch: /kpi-fit\.spec\.ts$/, dependencies: ["pdf"] },
    // chart-polish (T-032): worker sendiri (12 kota); lencana N/M, tab stop legenda, forced-colors.
    { name: "chart-polish", testMatch: /chart-polish\.spec\.ts$/, dependencies: ["kpi-fit"] },
    // pivot (T-tcjp, T-jwhc): worker sendiri (24 customer × 2 layanan × 3 bulan); panel, gulir, cetak.
    { name: "pivot", testMatch: /pivot\.spec\.ts$/, dependencies: ["chart-polish"] },
    // period-setup (T-051): worker sendiri; Atur periode → versi PERIOD_SETUP aktif → rollback.
    { name: "period-setup", testMatch: /period-setup\.spec\.ts$/, dependencies: ["pivot"] },
    { name: "rate-limit", testMatch: /zz-rate-limit\.spec\.ts$/, dependencies: ["period-setup"] },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3100",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
