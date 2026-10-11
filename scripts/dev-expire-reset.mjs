#!/usr/bin/env node
// Dev/e2e saja: majukan kedaluwarsa token RESET_PASSWORD milik email tertentu (uji aturan 30 menit
// tanpa menunggu). Akses DB langsung, tidak ada endpoint HTTP. Menolak jalan di produksi.
import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

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
const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("pakai: node scripts/dev-expire-reset.mjs <email>");
  process.exit(1);
}
const prisma = new PrismaClient();
const r = await prisma.verificationToken.updateMany({
  where: { purpose: "RESET_PASSWORD", usedAt: null, user: { email } },
  data: { expiresAt: new Date(Date.now() - 1000) },
});
console.log(`token reset dikedaluwarsakan: ${r.count}`);
await prisma.$disconnect();
