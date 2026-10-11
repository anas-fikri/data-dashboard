#!/usr/bin/env node
// Dev/e2e saja: hapus semua counter rate limit (rl:*) di Redis lokal. Menolak jalan di produksi.
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
let n = 0;
for await (const keys of r.scanStream({ match: "rl:*", count: 200 })) {
  if (keys.length) n += await r.del(...keys);
}
console.log(`rate limit direset: ${n} key`);
await r.quit();
