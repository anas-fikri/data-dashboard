#!/usr/bin/env node
// Smoke test header keamanan pada server PRODUKSI (next start). Bukti AC T-027 "di produksi".
// Pakai: node scripts/smoke-prod-headers.mjs http://localhost:3200
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3200";
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed++;
};

for (const path of ["/login", "/register", "/lupa-password", "/health"]) {
  const res = await fetch(base + path, { redirect: "manual" });
  const csp = res.headers.get("content-security-policy") ?? "";
  check(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp),
    `${path} CSP nonce + strict-dynamic`,
  );
  check(!csp.includes("unsafe-eval"), `${path} tanpa unsafe-eval`);
  check(csp.includes("frame-ancestors 'none'"), `${path} frame-ancestors 'none'`);
  check(res.headers.get("x-content-type-options") === "nosniff", `${path} nosniff`);
  check(
    res.headers.get("referrer-policy") === "strict-origin-when-cross-origin",
    `${path} Referrer-Policy`,
  );
  check(res.headers.get("strict-transport-security")?.includes("max-age") ?? false, `${path} HSTS`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const violations = [];
page.on("console", (m) => {
  if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
});
for (const path of ["/login", "/register", "/lupa-password"]) {
  await page.goto(base + path, { waitUntil: "networkidle" });
}
await page.getByTestId("theme-toggle").click();
const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
check(dark, "toggle tema berfungsi (script ber-nonce jalan)");
check(
  violations.length === 0,
  `0 pelanggaran CSP di console${violations.length ? ": " + violations[0] : ""}`,
);
await browser.close();

console.log(failed ? `\n${failed} pemeriksaan gagal` : "\nsemua pemeriksaan lolos");
process.exit(failed ? 1 : 0);
