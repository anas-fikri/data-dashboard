import { execFileSync } from "node:child_process";

/** Reset counter rate limit Redis lokal agar suite e2e deterministik. */
export default function globalSetup() {
  execFileSync("node", ["scripts/dev-reset-ratelimit.mjs"], { stdio: "inherit" });
}
