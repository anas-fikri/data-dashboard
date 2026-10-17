import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "results/playwright.json" }]],
  use: {
    baseURL: "https://127.0.0.1:4443",
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    headless: true,
  },
  webServer: [
    { command: "node server.mjs 4443 dist --https", url: "https://127.0.0.1:4443/", ignoreHTTPSErrors: true, reuseExistingServer: true },
    { command: "node server.mjs 4174 dist --no-csp", url: "http://127.0.0.1:4174/", reuseExistingServer: true },
  ],
  projects: [
    // Tanpa preset devices: UA asli engine di macOS (preset Chrome memakai UA Windows dan mengubah
    // pemetaan tombol Home/End/Cmd di AG Grid dan Glide).
    {
      name: "chromium",
      use: { browserName: "chromium", permissions: ["clipboard-read", "clipboard-write"] },
    },
    { name: "webkit", use: { browserName: "webkit" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
});
