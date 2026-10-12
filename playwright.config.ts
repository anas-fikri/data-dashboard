import { defineConfig } from "@playwright/test";

// E2E jalur kritis. Dijalankan terpisah (npm run test:e2e) karena butuh compose dev dan server.
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  // Spec rate limit mengisi bucket login IP 'local' (dev tanpa proxy): jalankan setelah semua spec
  // lain selesai, apa pun jumlah worker-nya (urutan nama file tidak menjamin ini saat paralel).
  projects: [
    { name: "e2e", testIgnore: /zz-rate-limit\.spec\.ts$/ },
    { name: "rate-limit", testMatch: /zz-rate-limit\.spec\.ts$/, dependencies: ["e2e"] },
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
