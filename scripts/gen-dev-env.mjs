#!/usr/bin/env node
// Membuat .env dari .env.example dengan secret acak untuk pengembangan lokal.
// Tidak menimpa .env yang sudah ada kecuali dipanggil dengan --force.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const force = process.argv.includes("--force");
if (existsSync(".env") && !force) {
  console.error(".env sudah ada. Gunakan --force untuk menimpa.");
  process.exit(1);
}

const rand = (n = 24) => randomBytes(n).toString("base64url");
const secrets = {
  AUTH_SECRET: rand(32),
  POSTGRES_PASSWORD: rand(),
  REDIS_PASSWORD: rand(),
  S3_ACCESS_KEY: `app${rand(6).replace(/[-_]/g, "")}`,
  S3_SECRET_KEY: rand(),
};

let out = readFileSync(".env.example", "utf8");
for (const [key, value] of Object.entries(secrets)) {
  out = out.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
}
out = out.replace(
  /^DATABASE_URL=.*$/m,
  `DATABASE_URL=postgresql://app:${secrets.POSTGRES_PASSWORD}@127.0.0.1:5433/data_dashboard`,
);
out = out.replace(
  /^REDIS_URL=.*$/m,
  `REDIS_URL=redis://:${secrets.REDIS_PASSWORD}@127.0.0.1:6380/0`,
);

writeFileSync(".env", out, { mode: 0o600 });
console.log(".env dibuat dengan secret acak (mode 600). Jalankan: npm run compose:up");
