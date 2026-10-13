#!/usr/bin/env node
// Dev/e2e saja (akses DB langsung, menolak NODE_ENV=production):
//   node scripts/dev-audit-log.mjs ids <email>...   → {"<email>":"<userId>"|null, ...}
//   node scripts/dev-audit-log.mjs target <email>   → baris AuditLog bersasaran user itu, urut waktu
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
const emails = args.map((e) => e.trim().toLowerCase()).filter(Boolean);
if (!["ids", "target"].includes(cmd) || emails.length === 0) {
  console.error("pakai: node scripts/dev-audit-log.mjs <ids|target> <email>...");
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  if (cmd === "ids") {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const byEmail = Object.fromEntries(emails.map((e) => [e, null]));
    for (const u of users) byEmail[u.email] = u.id;
    console.log(JSON.stringify(byEmail));
  } else {
    const user = await prisma.user.findUnique({
      where: { email: emails[0] },
      select: { id: true },
    });
    const rows = user
      ? await prisma.auditLog.findMany({
          where: { targetType: "user", targetId: user.id },
          orderBy: { at: "asc" },
          select: {
            action: true,
            actorId: true,
            targetType: true,
            targetId: true,
            meta: true,
            ip: true,
            at: true,
          },
        })
      : [];
    console.log(JSON.stringify(rows));
  }
} finally {
  await prisma.$disconnect();
}
