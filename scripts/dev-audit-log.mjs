#!/usr/bin/env node
// Dev/e2e saja (akses DB langsung, menolak NODE_ENV=production):
//   node scripts/dev-audit-log.mjs ids <email>...      → {"<email>":"<userId>"|null, ...}
//   node scripts/dev-audit-log.mjs target <email>      → baris AuditLog bersasaran user itu, urut waktu
//   node scripts/dev-audit-log.mjs dashboard <id>      → baris AuditLog bersasaran dashboard itu (T-016)
//   node scripts/dev-audit-log.mjs dataset <id>        → baris AuditLog bersasaran dataset itu (T-016)
// Keluaran baris: satu larik JSON [{action, actorId, targetType, targetId, meta, ip, at}, ...].
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
const [cmd, ...args] = process.argv.slice(2);
const values = args.map((a) => a.trim()).filter(Boolean);
const emails = values.map((e) => e.toLowerCase());
/** Sasaran berupa id objek (bukan email): jenis targetType di AuditLog. */
const BY_ID = { dashboard: "dashboard", dataset: "dataset" };
if (!["ids", "target", ...Object.keys(BY_ID)].includes(cmd) || values.length === 0) {
  console.error(
    "pakai: node scripts/dev-audit-log.mjs <ids|target> <email>... | <dashboard|dataset> <id>",
  );
  process.exit(1);
}
const prisma = new PrismaClient();
const select = {
  action: true,
  actorId: true,
  targetType: true,
  targetId: true,
  meta: true,
  ip: true,
  at: true,
};
const rowsFor = (targetType, targetId) =>
  prisma.auditLog.findMany({ where: { targetType, targetId }, orderBy: { at: "asc" }, select });
try {
  if (cmd === "ids") {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const byEmail = Object.fromEntries(emails.map((e) => [e, null]));
    for (const u of users) byEmail[u.email] = u.id;
    console.log(JSON.stringify(byEmail));
  } else if (cmd === "target") {
    const user = await prisma.user.findUnique({
      where: { email: emails[0] },
      select: { id: true },
    });
    console.log(JSON.stringify(user ? await rowsFor("user", user.id) : []));
  } else {
    console.log(JSON.stringify(await rowsFor(BY_ID[cmd], values[0])));
  }
} finally {
  await prisma.$disconnect();
}
