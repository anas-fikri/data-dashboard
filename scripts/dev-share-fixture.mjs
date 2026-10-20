#!/usr/bin/env node
// Dev/e2e saja (akses DB langsung, menolak NODE_ENV=production):
//   node scripts/dev-share-fixture.mjs <emailPemilik> <emailPenerima> <VIEWER|EDITOR|ORG> [datasetId]
// (datasetId: dashboard dibuat di dataset pemilik yang sudah ada, mis. uji Lihat data T-041)
// → dataset kosong + 1 dashboard milik pemilik, dibagikan ke penerima dengan peran itu, atau (ORG)
//   dibagikan ke seluruh organisasi tanpa share per orang (uji peran panduan T-022). Data ikut
//   terhapus dev-purge-test-data bersama akun uji.
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
const [ownerEmail, userEmail, role, datasetId] = process.argv.slice(2);
if (!ownerEmail || !userEmail || !["VIEWER", "EDITOR", "ORG"].includes(role)) {
  console.error(
    "pakai: node scripts/dev-share-fixture.mjs <emailPemilik> <emailPenerima> <VIEWER|EDITOR|ORG>",
  );
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  const [owner, user] = await Promise.all(
    [ownerEmail, userEmail].map((email) =>
      prisma.user.findUniqueOrThrow({
        where: { email: email.toLowerCase() },
        select: { id: true },
      }),
    ),
  );
  const name = `Bagikan ${Date.now()}`;
  const dataset = datasetId
    ? await prisma.dataset.findFirstOrThrow({ where: { id: datasetId, ownerId: owner.id } })
    : await prisma.dataset.create({
        data: { ownerId: owner.id, name, nameKey: name.toLowerCase() },
      });
  const dashboard = await prisma.dashboard.create({
    data: { datasetId: dataset.id, name, nameKey: name.toLowerCase(), orgShared: role === "ORG" },
  });
  if (role !== "ORG")
    await prisma.dashboardShare.create({
      data: { dashboardId: dashboard.id, userId: user.id, role, createdById: owner.id },
    });
  console.log(JSON.stringify({ datasetId: dataset.id, dashboardId: dashboard.id }));
} finally {
  await prisma.$disconnect();
}
