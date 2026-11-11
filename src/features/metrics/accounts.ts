import "server-only";
import type Redis from "ioredis";
import { userUsage } from "@/features/uploads/quota";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { readAccountActivity } from "@/lib/metrics/store";
import { ORDER_BUILD_USER } from "@/features/query/order-build-user";
import {
  exportQueue,
  ingestQueue,
  MAP_VERSION_JOB,
  pdfQueue,
  recastQueue,
  withQueueTimeout,
} from "@/lib/queue/connection";
import { rankAccounts, type AccountJobs, type AccountRow } from "./view";

/*
 * Tabel per akun Admin › Sumber daya (v1.18 fase 2, T-qed9) — perkiraan, admin saja: query berjalan + detik
 * eksekusi 15 menit (pelacak DuckDB per user), job worker yang sedang berjalan (unggah/olah ulang/pemetaan/
 * ekspor/PDF) dipetakan ke pemiliknya, dan storage terpakai (sama dengan hitungan kuota unggah, cache 5 menit;
 * gagal per akun → "–").
 * Hanya akun yang aktif; paling banyak 20 baris, terberat di atas.
 */
const MAX_JOBS = 100;
/** Storage berubah lambat: cache 5 menit (+ acak ≤ 1 menit agar tidak kedaluwarsa bersamaan). */
const USAGE_TTL_MS = 5 * 60_000;
/** userUsage = 3 query (termasuk semua segmen akun): dibatasi 3 bersamaan agar pool DB tidak tersentak. */
const USAGE_CONCURRENCY = 3;
const usageCache = globalThis as unknown as {
  metricsUsage?: Map<string, { bytes: number; at: number }>;
};

interface JobLike {
  name: string;
  data: Record<string, unknown>;
}

const active = (q: {
  getJobs(types: "active"[], start: number, end: number): Promise<unknown[]>;
}) =>
  withQueueTimeout(q.getJobs(["active"], 0, MAX_JOBS - 1), "job aktif per akun")
    .then((jobs) => jobs.filter(Boolean) as JobLike[])
    .catch(() => [] as JobLike[]);

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Job aktif per akun. Data job lama tanpa pemilik dilewati (perkiraan). */
async function jobsByUser(): Promise<Map<string, AccountJobs>> {
  const [ingest, recast, exports, pdfs] = await Promise.all([
    active(ingestQueue()),
    active(recastQueue()),
    active(exportQueue()),
    active(pdfQueue()),
  ]);
  const out = new Map<string, AccountJobs>();
  const bump = (userId: string | null, kind: keyof AccountJobs) => {
    if (!userId) return;
    const j = out.get(userId) ?? { upload: 0, recast: 0, export: 0 };
    j[kind]++;
    out.set(userId, j);
  };
  const versionIds = ingest.map((j) => str(j.data.versionId)).filter((x): x is string => !!x);
  const exportIds = [...exports, ...pdfs]
    .map((j) => str(j.data.exportId))
    .filter((x): x is string => !!x);
  const [versions, exportRows] = await Promise.all([
    versionIds.length
      ? prisma.datasetVersion.findMany({
          where: { id: { in: versionIds } },
          select: { dataset: { select: { ownerId: true } } },
        })
      : [],
    exportIds.length
      ? prisma.export.findMany({ where: { id: { in: exportIds } }, select: { userId: true } })
      : [],
  ]);
  for (const v of versions) bump(v.dataset.ownerId, "upload");
  for (const j of recast) {
    // Satu antrean untuk olah ulang skema (userId) dan pemetaan versi baru (job "map-version", actorId).
    bump(str(j.name === MAP_VERSION_JOB ? j.data.actorId : j.data.userId), "recast");
  }
  for (const e of exportRows) bump(e.userId, "export");
  return out;
}

async function storageOf(ids: string[], now: number): Promise<Map<string, number>> {
  const cache = (usageCache.metricsUsage ??= new Map());
  const out = new Map<string, number>();
  const todo: string[] = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && now < hit.at) out.set(id, hit.bytes);
    else todo.push(id);
  }
  for (let i = 0; i < todo.length; i += USAGE_CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + USAGE_CONCURRENCY).map(async (id) => {
        try {
          const bytes = (await userUsage(prisma, id)).bytes;
          // `at` = saat kedaluwarsa.
          cache.set(id, { bytes, at: now + USAGE_TTL_MS + Math.random() * 60_000 });
          out.set(id, bytes);
        } catch (e) {
          // Satu akun gagal dihitung (mis. query berat timeout) → kolomnya "–", tabel lain tetap tampil.
          logger.warn(
            { userId: id, err: e instanceof Error ? e.message : String(e) },
            "storage per akun gagal dihitung",
          );
        }
      }),
    );
  }
  return out;
}

export async function accountRows(
  r: Redis,
  now = Date.now(),
): Promise<{ rows: AccountRow[]; quotaBytes: number }> {
  const [activity, jobs] = await Promise.all([readAccountActivity(r, now), jobsByUser()]);
  const ids = [...new Set([...activity.keys(), ...jobs.keys()])];
  if (!ids.length) return { rows: [], quotaBytes: env().USER_STORAGE_QUOTA_BYTES };
  const users: { id: string; email: string; name: string | null }[] = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, name: true },
  });
  // Penyusunan cache urutan "Lihat data" berjalan di latar atas nama sistem, bukan akun tertentu.
  if (ids.includes(ORDER_BUILD_USER)) {
    users.push({ id: ORDER_BUILD_USER, email: "", name: "Sistem — cache urutan Lihat data" });
  }
  const top = rankAccounts(users, activity, jobs, 20);
  const storage = await storageOf(
    top.map((row) => row.id).filter((id) => id !== ORDER_BUILD_USER),
    now,
  );
  return {
    rows: top.map((row) => ({ ...row, storageBytes: storage.get(row.id) ?? null })),
    quotaBytes: env().USER_STORAGE_QUOTA_BYTES,
  };
}
