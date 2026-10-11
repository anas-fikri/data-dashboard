#!/usr/bin/env node
// Dev/e2e saja: jadikan user (berdasarkan email) admin. Akses DB langsung; menolak di produksi.
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
  console.error("pakai: node scripts/dev-make-admin.mjs <email>");
  process.exit(1);
}
const prisma = new PrismaClient();
const r = await prisma.user.updateMany({ where: { email }, data: { isAdmin: true } });
console.log(`admin diset: ${r.count}`);
await prisma.$disconnect();
