#!/usr/bin/env node
// Pulihkan admin terakhir (runbook README "Memulihkan admin terakhir"): akun yang SUDAH ada dan
// SUDAH memverifikasi email dijadikan aktif + admin, sesi lamanya diputus (sessionVersion naik), dan
// satu baris AuditLog ditulis (actorId null, action "user.admin.restore", ip "cli") di transaksi
// yang sama, di bawah lock 'admins' yang sama dengan aplikasi. Meta audit mencatat operator
// (user OS + hostname). Akun yang sudah admin aktif → tidak ada perubahan (tanpa audit, sesi utuh).
// Hanya untuk keadaan darurat (tidak ada admin aktif yang bisa login). Wajib --confirm bila
// NODE_ENV=production ATAU DATABASE_URL tidak menunjuk ke localhost/127.0.0.1/::1.
// Pakai: node scripts/admin-restore.mjs <email> [--confirm]
import { readFileSync, existsSync } from "node:fs";
import os from "node:os";
import { PrismaClient } from "@prisma/client";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("pakai: node scripts/admin-restore.mjs <email> [--confirm]");
  process.exit(2);
}
/** Host DATABASE_URL; URL kosong/rusak dianggap bukan lokal (wajib --confirm). */
function dbHost() {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
}
const pgHost = dbHost();
const localDb = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(pgHost);
if ((process.env.NODE_ENV === "production" || !localDb) && !confirm) {
  const why =
    process.env.NODE_ENV === "production"
      ? "NODE_ENV=production"
      : `DATABASE_URL menunjuk ke ${pgHost || "host tidak dikenal"} (bukan localhost)`;
  console.error(
    `menolak: ${why}. Ini mengubah peran admin di database itu; ` +
      "ulangi dengan --confirm bila memang dimaksudkan.",
  );
  process.exit(1);
}

/** Operator CLI untuk AuditLog (actorId kosong): user OS + hostname. */
function operator() {
  let osUser = process.env.USER ?? process.env.LOGNAME ?? null;
  try {
    osUser = os.userInfo().username;
  } catch {
    // Container tanpa entri passwd untuk uid ini: pakai env di atas.
  }
  return { osUser, host: os.hostname() };
}

const prisma = new PrismaClient();
try {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admins'))`;
    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true, isAdmin: true, isActive: true, emailVerifiedAt: true },
    });
    if (!user) return { error: "akun tidak ditemukan" };
    if (!user.emailVerifiedAt) return { error: "akun belum memverifikasi email" };
    if (user.isAdmin && user.isActive) return { noop: true };
    await tx.user.update({
      where: { id: user.id },
      data: { isAdmin: true, isActive: true, sessionVersion: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "user.admin.restore",
        targetType: "user",
        targetId: user.id,
        meta: { wasAdmin: user.isAdmin, wasActive: user.isActive, ...operator() },
        ip: "cli",
      },
    });
    return { id: user.id, wasAdmin: user.isAdmin, wasActive: user.isActive };
  });
  if (result.error) {
    console.error(`gagal: ${result.error} (${email}). Tidak ada perubahan.`);
    process.exitCode = 1;
  } else if (result.noop) {
    console.log(`${email} sudah admin aktif. Tidak ada perubahan (sesi tetap, tanpa AuditLog).`);
  } else {
    console.log(JSON.stringify({ restored: email, ...result }));
    console.warn(
      "PERINGATAN: akun ini kini admin aktif; sesi lamanya diputus, jadi ia perlu login lagi. " +
        "Tindakan tercatat di AuditLog (user.admin.restore, ip cli, user OS + hostname).",
    );
  }
} finally {
  await prisma.$disconnect();
}
