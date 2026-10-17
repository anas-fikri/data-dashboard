#!/usr/bin/env node
// Dev saja (T-xfzy): jalankan perintah dengan env DEMO terpisah — database <nama>_demo (dibuat oleh
// `node scripts/with-demo-env.mjs npx prisma migrate deploy`) + Redis DB index 9 (antrean dan rate
// limit terpisah), DEMO_ENV=1. Rekaman video panduan hanya boleh di sini agar data user nyata di DB dev
// tidak ikut terekam. Nilai env tidak pernah dicetak. Pakai: node scripts/with-demo-env.mjs <cmd> [args...]
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
const db = new URL(env.DATABASE_URL);
const name = db.pathname.replace(/^\//, "");
if (process.env.NODE_ENV === "production") throw new Error("ditolak: NODE_ENV=production");
if (!name || name.endsWith("_demo")) throw new Error("DATABASE_URL tidak terduga");
db.pathname = `/${name}_demo`;
env.DATABASE_URL = db.toString();
const redis = new URL(env.REDIS_URL);
redis.pathname = "/9";
env.REDIS_URL = redis.toString();
env.DEMO_ENV = "1";
const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
