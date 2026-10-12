#!/usr/bin/env node
// Dev/e2e saja: hapus counter rate limit di Redis lokal. Menolak jalan di produksi.
//   node scripts/dev-reset-ratelimit.mjs                 → semua (rl:*), mis. di global setup
//   node scripts/dev-reset-ratelimit.mjs register:ip     → hanya bucket itu (rl:register:ip:*)
// Di tengah suite paralel pakai nama bucket: menghapus semua counter ikut mengosongkan bucket yang
// sedang diuji test lain (mis. batas reset password per email) dan membuatnya gagal acak.
import { readFileSync, existsSync } from "node:fs";
import Redis from "ioredis";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
if (process.env.NODE_ENV === "production") {
  console.error("menolak: NODE_ENV=production");
  process.exit(1);
}
const r = new Redis(process.env.REDIS_URL);
const buckets = process.argv.slice(2);
const patterns = buckets.length ? buckets.map((b) => `rl:${b}:*`) : ["rl:*"];
let n = 0;
for (const match of patterns) {
  for await (const keys of r.scanStream({ match, count: 200 })) {
    if (keys.length) n += await r.del(...keys);
  }
}
console.log(`rate limit direset: ${n} key`);
await r.quit();
