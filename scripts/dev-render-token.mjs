#!/usr/bin/env node
// Dev/e2e saja (T-018 AC2): buat token render PDF seperti yang dibuat worker, tanpa renderer/worker.
//   node scripts/dev-render-token.mjs mint <email> <dashboardId> [--f '<json FilterState>'] [--expired]
//     → baris Export PDF RUNNING milik user itu + token di Redis (render:tok:<sha256>, PX 60 detik).
//       --expired: klaim exp sudah lewat (kunci Redis masih ada) → server wajib 404 dari cek exp.
//       Mencetak JSON { token, exportId } (token hanya berlaku 60 detik, sekali pakai).
//   node scripts/dev-render-token.mjs close <exportId>
//     → Export RUNNING/QUEUED itu → FAILED (melepas jatah 2 ekspor berjalan user).
// Bentuk klaim HARUS sama dengan src/features/exports/render-token.ts (storedSchema). Akses DB/Redis
// langsung, tidak ada endpoint HTTP. Menolak jalan di produksi.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
if (process.env.NODE_ENV === "production") {
  console.error("menolak: NODE_ENV=production");
  process.exit(1);
}

const TTL_MS = 60_000;
const CUID = /^[a-z0-9]{20,32}$/;
const usage = () => {
  console.error(
    "pakai: node scripts/dev-render-token.mjs mint <email> <dashboardId> [--f '<json>'] [--expired]\n" +
      "       node scripts/dev-render-token.mjs close <exportId>",
  );
  process.exit(1);
};

const [cmd, ...rest] = process.argv.slice(2);
const prisma = new PrismaClient();
try {
  if (cmd === "mint") {
    const [email, dashboardId] = rest;
    const fAt = rest.indexOf("--f");
    const f = fAt >= 0 ? rest[fAt + 1] : undefined;
    const expired = rest.includes("--expired");
    if (!email || !CUID.test(dashboardId ?? "")) usage();
    if (f !== undefined) JSON.parse(f); // f rusak → gagal di sini, bukan diam-diam
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error(`user ${email} tidak ada`);
    const now = Date.now();
    const requestedAt = new Date(now).toISOString();
    const exp = await prisma.export.create({
      data: {
        userId: user.id,
        dashboardId,
        widgetId: null,
        format: "PDF",
        status: "RUNNING",
        startedAt: new Date(now),
        params: { ...(f ? { f } : {}), requestedAt },
        fileName: "dev-render-token.pdf",
      },
      select: { id: true },
    });
    const token = randomBytes(32).toString("base64url");
    const claims = {
      exportId: exp.id,
      userId: user.id,
      dashboardId,
      ...(f ? { f } : {}),
      requestedAt,
      exp: expired ? now - 1_000 : now + TTL_MS,
    };
    const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    try {
      const key = `render:tok:${createHash("sha256").update(token).digest("hex")}`;
      const ok = await redis.set(key, JSON.stringify(claims), "PX", TTL_MS, "NX");
      if (ok !== "OK") throw new Error("token gagal disimpan");
    } finally {
      redis.disconnect();
    }
    console.log(JSON.stringify({ token, exportId: exp.id }));
  } else if (cmd === "close") {
    const [id] = rest;
    if (!CUID.test(id ?? "")) usage();
    const r = await prisma.export.updateMany({
      where: { id, status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        errorCode: "EXPORT_FAILED",
        errorMessage: "Ditutup skrip dev.",
        finishedAt: new Date(),
      },
    });
    console.log(JSON.stringify({ id, closed: r.count }));
  } else {
    usage();
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
