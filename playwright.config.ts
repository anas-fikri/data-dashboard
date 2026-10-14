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
        /widgets\.spec\.ts$/,
        /admin\.spec\.ts$/,
        /filters\.spec\.ts$/,
        /versions\.spec\.ts$/,
        /mapping\.spec\.ts$/,
      ],
    },
    { name: "ingest", testMatch: /ingest\.spec\.ts$/, dependencies: ["e2e"] },
    { name: "schema", testMatch: /schema\.spec\.ts$/, dependencies: ["ingest"] },
    // widgets: menyalakan worker sendiri untuk ingest fixture (setelah worker schema berhenti).
    { name: "widgets", testMatch: /widgets\.spec\.ts$/, dependencies: ["schema"] },
    // admin: juga menyalakan worker sendiri (dataset + KPI sungguhan untuk uji alih kepemilikan).
    { name: "admin", testMatch: /admin\.spec\.ts$/, dependencies: ["widgets"] },
    // filters (T-012): worker sendiri untuk fixture 5.000 baris (slicer, preset tanggal, filter silang).
    { name: "filters", testMatch: /filters\.spec\.ts$/, dependencies: ["admin"] },
    // versions (T-013): worker sendiri; ganti data, retensi, rollback, dan job maintenance sungguhan.
    { name: "versions", testMatch: /versions\.spec\.ts$/, dependencies: ["filters"] },
    // mapping (T-014): worker sendiri; ganti nama/hilang/tambah kolom → pemetaan → versi aktif.
    { name: "mapping", testMatch: /mapping\.spec\.ts$/, dependencies: ["versions"] },
    { name: "rate-limit", testMatch: /zz-rate-limit\.spec\.ts$/, dependencies: ["mapping"] },
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
