/*
 * Perf siklus periode bulanan (T-063 AC1/AC2/AC4): jalur produksi utuh pada database + storage + worker
 * SUNGGUHAN (dev, atau stack uji VM `deploy/perf-stack.sh`; menolak NODE_ENV=production):
 *   1. dataset baru; bulan pertama diunggah biasa (mode REPLACE) lalu "Atur periode" per bulan;
 *   2. bulan berikutnya diunggah satu per satu sebagai unggahan periode (initUpload → part langsung ke
 *      storage internal → completeUpload → antrean ingest → worker), sampai `--months` bulan
 *      × `--rows` baris; lalu `--big-months` bulan × `--big-rows` baris dengan "Lepas periode terlama
 *      otomatis" (setiap pelepasan lewat tinjauan → Terapkan, seperti pemilik);
 *   3. per unggahan: waktu transfer, waktu proses (complete → READY aktif), waktu Terapkan, objek baru di
 *      storage (sumber, raw/typed segmen) vs byte parquet periodenya (metadata Segment/SegmentTyped), dan
 *      objek lama yang berubah/hilang (harus 0);
 *   4. setelah semua: retensi versi (+ tenggang 1 jam dilompati), retensi file asli (7 hari dilompati),
 *      GC segmen (tenggang 24 jam dilompati), storage-cleanup — semuanya DIBATASI ke dataset perf (data
 *      lain di database yang sama tidak tersentuh) — lalu job invarian segment-audit; total storage dataset dibandingkan dengan byte data aktif dan byte yang masih
 *      dirujuk versi tersimpan.
 * Worker harus menyala (dev: `npm run worker`; stack uji: service worker). Satu dataset per putaran.
 *
 *   npx tsx --conditions=react-server --env-file-if-exists=.env scripts/perf-period-cycle.ts \
 *     --owner <email> --dir <scratch> [--months 24] [--rows 400000] [--big-months 10]
 *     [--big-rows 1000000] [--keep-periods N] [--out hasil.json] [--keep]
 * (--keep-periods: "Simpan N periode" mulai bulan besar pertama; bawaan = PERIOD_KEEP_DEFAULT.)
 * --checkpoints 0,1,2,24,end: setelah unggahan ke-N (0 = sebelum unggahan pertama, end = setelah
 * pemeliharaan) skrip menulis <dir>/checkpoint-<N>.json lalu menunggu <dir>/checkpoint-<N>.done (maks.
 * 60 menit) — scripts/perf-period-cycle-vm.sh menjalankan backup harian sungguhan di titik itu.
 * Keluaran: JSON per unggahan (stdout, satu baris per langkah) + ringkasan di --out. Tanpa --keep dataset
 * dihapus di akhir (objeknya lewat penghapusan dataset biasa).
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { ListObjectsV2Command, UploadPartCommand } from "@aws-sdk/client-s3";
import { deleteDataset } from "@/features/datasets/service";
import { completeUpload, initUpload } from "@/features/uploads/service";
import { runRawRetention, runStorageCleanup } from "@/features/versions/cleanup";
import { runSegmentGc, SEGMENT_GC_GRACE_MS } from "@/features/versions/gc";
import { runStorageAudit } from "@/features/versions/integrity";
import { applyPeriodSetup, previewPeriodSetup } from "@/features/versions/period-setup";
import { confirmPeriodUpload, reviewPeriodUpload } from "@/features/versions/period-upload";
import { prisma } from "@/lib/db";
import { bucket, s3Internal } from "@/lib/storage/s3";

if (process.env.NODE_ENV === "production") {
  console.error("menolak: NODE_ENV=production (pakai dev atau stack uji, NODE_ENV=test)");
  process.exit(1);
}

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const IP = "127.0.0.1";
const POLL_MS = 200;
const PROCESS_TIMEOUT_MS = 30 * 60 * 1000;
const TERMINAL = new Set(["READY", "FAILED", "AWAITING_CONFIRM", "AWAITING_MAPPING"]);
const HEAD = "kode;tanggal;cabang;layanan;berat;koli;tarif;diskon;status;kota;catatan;nilai";

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const mb = (b: number | bigint) => round(Number(b) / 1048576, 1);

/** Bulan ke-i (0 = Jan 2024) sebagai {key: "2024-01", days}. */
function month(i: number) {
  const y = 2024 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { key: `${y}-${String(m).padStart(2, "0")}`, days };
}

/** CSV satu bulan, deterministik, 12 kolom campuran (sama dengan scripts/perf-period-ingest.ts). */
async function writeMonthCsv(path: string, i: number, rows: number) {
  const { key, days } = month(i);
  const out = createWriteStream(path);
  const write = (s: string) =>
    out.write(s) ? Promise.resolve() : new Promise<void>((r) => out.once("drain", () => r()));
  await write(`${HEAD}\n`);
  let buf: string[] = [];
  for (let r = 0; r < rows; r++) {
    const n = i * 10_000_000 + r;
    buf.push(
      [
        `AWB${String(n).padStart(11, "0")}`,
        `${key}-${String((r % days) + 1).padStart(2, "0")}`,
        `CAB${r % 37}`,
        ["REG", "YES", "ONS"][r % 3],
        `${(r % 50) + 1},${r % 10}`,
        String((r % 7) + 1),
        String(10_000 + (r % 900) * 25),
        String(r % 5),
        ["Terkirim", "Proses", "Retur"][r % 3],
        `Kota ${r % 91}`,
        r % 11 === 0 ? `catatan ${n}` : "",
        String((n * 37) % 100_000),
      ].join(";"),
    );
    if (buf.length === 10_000) {
      await write(`${buf.join("\n")}\n`);
      buf = [];
    }
  }
  if (buf.length) await write(`${buf.join("\n")}\n`);
  await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
}

type Listing = Map<string, { size: number; modified: number }>;

/** Semua objek dataset (raw/<ds>/ + parquet/<ds>/) dengan ukuran. */
async function listDataset(datasetId: string): Promise<Listing> {
  const out: Listing = new Map();
  for (const prefix of [`raw/${datasetId}/`, `parquet/${datasetId}/`]) {
    let token: string | undefined;
    do {
      const r = await s3Internal().send(
        new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of r.Contents ?? []) {
        out.set(o.Key!, { size: o.Size ?? 0, modified: o.LastModified?.getTime() ?? 0 });
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
  }
  return out;
}

const sum = (l: Listing, pred: (k: string) => boolean = () => true) =>
  [...l].reduce((n, [k, v]) => n + (pred(k) ? v.size : 0), 0);

function diff(before: Listing, after: Listing) {
  const added = [...after].filter(([k]) => !before.has(k));
  const changed = [...after].filter(([k, v]) => {
    const b = before.get(k);
    return b !== undefined && (b.size !== v.size || b.modified !== v.modified);
  });
  const removed = [...before.keys()].filter((k) => !after.has(k));
  return { added, changed, removed };
}

/** Byte parquet (raw + typed) yang dirujuk manifest versi tertentu, tiap objek dihitung sekali. */
async function referencedBytes(where: { versionIds: string[] }) {
  const rows = await prisma.sheetSegment.findMany({
    where: { sheet: { versionId: { in: where.versionIds } } },
    select: {
      segmentTyped: {
        select: {
          typedKey: true,
          typedBytes: true,
          segment: { select: { rawKey: true, rawBytes: true } },
        },
      },
    },
  });
  const keys = new Map<string, number>();
  for (const { segmentTyped: t } of rows) {
    keys.set(t.typedKey, Number(t.typedBytes ?? 0));
    keys.set(t.segment.rawKey, Number(t.segment.rawBytes ?? 0));
  }
  return { keys, bytes: [...keys.values()].reduce((a, b) => a + b, 0) };
}

async function activeVersionId(datasetId: string): Promise<string | null> {
  const d = await prisma.dataset.findUnique({
    where: { id: datasetId },
    select: { activeVersionId: true },
  });
  return d?.activeVersionId ?? null;
}

async function waitTerminal(versionId: string) {
  const t0 = Date.now();
  for (;;) {
    const v = await prisma.datasetVersion.findUniqueOrThrow({
      where: { id: versionId },
      select: { status: true, errorMessage: true, ingestStartedAt: true, ingestFinishedAt: true },
    });
    if (TERMINAL.has(v.status)) return { ...v, waitedMs: Date.now() - t0 };
    if (Date.now() - t0 > PROCESS_TIMEOUT_MS) throw new Error(`versi ${versionId} macet`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Unggah file seperti browser (init → part → complete), tapi part langsung ke storage internal. */
async function upload(
  userId: string,
  datasetId: string,
  path: string,
  name: string,
  mode: "REPLACE" | "PERIOD",
) {
  const size = statSync(path).size;
  const baseVersionId = mode === "PERIOD" ? await activeVersionId(datasetId) : undefined;
  const t0 = performance.now();
  const init = await initUpload(userId, {
    datasetId,
    name,
    size,
    lastModified: Date.now(),
    mode,
    ...(baseVersionId ? { baseVersionId } : {}),
  });
  if (!init.ok) throw new Error(`init ${name}: ${init.code} ${init.message}`);
  const v = await prisma.datasetVersion.findUniqueOrThrow({
    where: { id: init.versionId },
    select: { sourceKey: true, uploadId: true },
  });
  for (let n = 1; n <= init.partCount; n++) {
    const start = (n - 1) * init.partSize;
    const end = Math.min(size, start + init.partSize);
    await s3Internal().send(
      new UploadPartCommand({
        Bucket: bucket(),
        Key: v.sourceKey!,
        UploadId: v.uploadId!,
        PartNumber: n,
        ContentLength: end - start,
        Body: createReadStream(path, { start, end: end - 1 }),
      }),
    );
  }
  const done = await completeUpload(userId, init.versionId);
  if (!done.ok) throw new Error(`complete ${name}: ${done.code} ${done.message}`);
  const t1 = performance.now();
  const end = await waitTerminal(init.versionId);
  const t2 = performance.now();
  return {
    versionId: init.versionId,
    transferS: (t1 - t0) / 1000,
    processS: (t2 - t1) / 1000,
    workerS:
      end.ingestStartedAt && end.ingestFinishedAt
        ? (end.ingestFinishedAt.getTime() - end.ingestStartedAt.getTime()) / 1000
        : null,
    status: end.status,
    error: end.errorMessage,
    size,
  };
}

/** "Terapkan" unggahan periode yang ditahan tinjauan (pelepasan/penggantian), seperti pemilik. */
async function confirm(userId: string, datasetId: string, versionId: string) {
  const t0 = performance.now();
  const r = await reviewPeriodUpload(userId, datasetId, versionId, { include: [] });
  if (!r.ok) throw new Error(`tinjau: ${r.code} ${r.message}`);
  const plan = r.data.plan;
  const c = await confirmPeriodUpload(
    userId,
    datasetId,
    versionId,
    {
      include: [],
      digest: r.data.digest,
      ack: { shrink: plan.confirm.includes("SHRINK"), droppedRows: plan.droppedRows },
    },
    IP,
  );
  if (!c.ok) throw new Error(`terapkan: ${c.code} ${c.message}`);
  const evicted = plan.entries.filter((e) => e.action === "EVICTED").map((e) => e.key);
  return { confirmS: (performance.now() - t0) / 1000, summary: c.data.summary, evicted };
}

async function setupPeriods(userId: string, datasetId: string) {
  const active = await activeVersionId(datasetId);
  const sheet = await prisma.sheet.findFirstOrThrow({
    where: { versionId: active! },
    select: { id: true, schema: true },
  });
  const col = (sheet.schema as { pos: number; original: string }[]).find(
    (c) => c.original === "tanggal",
  )!;
  const input = {
    grain: "MONTH",
    sheets: [{ sheetId: sheet.id, source: "COLUMN", column: col.pos }],
    label: null,
    keepPeriods: null,
    onLimit: "REJECT",
    dropMissing: 0,
  };
  const t0 = performance.now();
  const p = await previewPeriodSetup(userId, datasetId, input);
  if (!p.ok) throw new Error(`tinjau atur periode: ${p.code} ${p.message}`);
  const a = await applyPeriodSetup(
    userId,
    datasetId,
    { ...input, reviewed: { baseVersionId: p.data.baseVersionId, digest: p.data.digest } },
    IP,
  );
  if (!a.ok) throw new Error(`atur periode: ${a.code} ${a.message}`);
  const end = await waitTerminal(a.data.versionId);
  if (end.status !== "READY") throw new Error(`atur periode ${end.status}: ${end.errorMessage}`);
  return (performance.now() - t0) / 1000;
}

/** Pengaturan pemilik (sama dengan savePeriodSettings, tanpa AuditLog). */
async function setLimit(datasetId: string, keepPeriods: number | null) {
  await prisma.dataset.update({
    where: { id: datasetId },
    data: { onLimit: "EVICT_OLDEST", keepPeriods },
  });
}

/** Byte parquet periode yang baru ditulis versi ini (segmen + revisi typed-nya). */
async function newSegmentBytes(versionId: string) {
  const segs = await prisma.segment.findMany({
    where: { createdByVersionId: versionId },
    select: {
      periodKey: true,
      rawBytes: true,
      typed: { select: { typedBytes: true, dataRows: true } },
    },
  });
  return {
    periods: segs.map((s) => s.periodKey),
    rows: segs.reduce((n, s) => n + s.typed.reduce((m, t) => m + (t.dataRows ?? 0), 0), 0),
    raw: segs.reduce((n, s) => n + Number(s.rawBytes ?? 0), 0),
    typed: segs.reduce((n, s) => n + s.typed.reduce((m, t) => m + Number(t.typedBytes ?? 0), 0), 0),
  };
}

/**
 * Pemeliharaan dengan jam dimajukan, HANYA untuk dataset perf (job dibatasi `datasetId`): data lain di
 * database yang sama tidak ikut dihapus lebih awal. segment-audit dijalankan apa adanya (job malam yang
 * sama: membaca semua kunci, menyerahkan yatim > 24 jam ke pembersihan seperti biasa).
 */
async function maintenance(datasetId: string) {
  const now = new Date();
  const later = (ms: number) => new Date(now.getTime() + ms);
  const drain = async (at: Date) => {
    let n = 0;
    for (let i = 0; i < 50; i++) {
      const r = await runStorageCleanup(undefined, at, datasetId);
      n += r.deleted;
      if (r.deleted + r.skipped + r.failed === 0) break;
    }
    return n;
  };
  // 1. Retensi versi (3 versi siap terakhir) sudah dijadwalkan saat aktivasi dengan tenggang 1 jam.
  const retention = await drain(later(2 * 60 * 60 * 1000));
  // 2. File asli > 7 hari (semua unggahan putaran ini dianggap sudah lewat seminggu).
  const raw = await runRawRetention(undefined, later(8 * 24 * 60 * 60 * 1000), datasetId);
  // 3. GC segmen: tandai, lalu sapu tanpa tenggang 24 jam (dataset ini saja), lalu hapus objeknya.
  const gcMark = await runSegmentGc(now, SEGMENT_GC_GRACE_MS, datasetId);
  const gcSweep = await runSegmentGc(now, 0, datasetId);
  const swept = await drain(later(60 * 1000));
  // 4. Job invarian malam (semua kunci terujuk ada, yatim diserahkan ke pembersihan).
  const audit = await runStorageAudit(undefined, now);
  return {
    retentionDeleted: retention,
    rawRetention: raw,
    gcMark,
    gcSweep,
    gcDeleted: swept,
    audit,
  };
}

/** Titik sinkron dengan pemanggil (backup sungguhan di VM): tulis status, tunggu tanda selesai. */
async function checkpoint(dir: string, label: string, datasetId: string, wanted: Set<string>) {
  if (!wanted.has(label)) return null;
  const listing = await listDataset(datasetId);
  const state = {
    label,
    datasetMB: mb(sum(listing)),
    sourceMB: mb(sum(listing, (k) => k.startsWith("raw/"))),
    at: new Date().toISOString(),
  };
  writeFileSync(join(dir, `checkpoint-${label}.json`), `${JSON.stringify(state)}\n`);
  const done = join(dir, `checkpoint-${label}.done`);
  const t0 = Date.now();
  while (!existsSync(done)) {
    if (Date.now() - t0 > 60 * 60 * 1000) throw new Error(`checkpoint ${label} tidak diselesaikan`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ...state, backup: readFileSync(done, "utf8").trim() };
}

async function main() {
  const ownerEmail = arg("owner")?.toLowerCase();
  const dir = arg("dir");
  if (!ownerEmail || !dir) {
    throw new Error("pakai: perf-period-cycle.ts --owner <email> --dir <scratch> [--months 24] …");
  }
  const months = Number(arg("months", "24"));
  const rows = Number(arg("rows", "400000"));
  const bigMonths = Number(arg("big-months", "10"));
  const bigRows = Number(arg("big-rows", "1000000"));
  const outPath = arg("out");
  const keepPeriods = arg("keep-periods") ? Number(arg("keep-periods")) : null;
  const keep = process.argv.includes("--keep");
  const checkpoints = new Set((arg("checkpoints") ?? "").split(",").filter(Boolean));
  mkdirSync(dir, { recursive: true });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const name = `Perf siklus periode ${Date.now()}`;
  const dataset = await prisma.dataset.create({
    data: { ownerId: owner.id, name, nameKey: name.toLowerCase() },
    select: { id: true },
  });
  const datasetId = dataset.id;
  const dbBefore = await prisma.$queryRaw<
    { b: bigint }[]
  >`SELECT pg_database_size(current_database()) AS b`;
  const steps: Record<string, unknown>[] = [];
  const log = (o: Record<string, unknown>) => {
    steps.push(o);
    console.log(JSON.stringify(o));
  };
  const marks: unknown[] = [];
  const mark = async (label: string) => {
    const c = await checkpoint(dir, label, datasetId, checkpoints);
    if (c) {
      marks.push(c);
      log({ checkpoint: c });
    }
  };
  try {
    await mark("0");
    const total = months + bigMonths;
    for (let i = 0; i < total; i++) {
      const big = i >= months;
      const n = big ? bigRows : rows;
      const { key } = month(i);
      const file = join(dir, `${key}.csv`);
      await writeMonthCsv(file, i, n);
      if (i === months && bigMonths) await setLimit(datasetId, keepPeriods);
      const before = await listDataset(datasetId);
      const u = await upload(
        owner.id,
        datasetId,
        file,
        `${key}.csv`,
        i === 0 ? "REPLACE" : "PERIOD",
      );
      rmSync(file, { force: true });
      let confirmed: Awaited<ReturnType<typeof confirm>> | null = null;
      if (u.status === "AWAITING_CONFIRM")
        confirmed = await confirm(owner.id, datasetId, u.versionId);
      else if (u.status !== "READY") throw new Error(`${key}: ${u.status} ${u.error ?? ""}`);
      const setupS = i === 0 ? await setupPeriods(owner.id, datasetId) : null;
      const after = await listDataset(datasetId);
      const d = diff(before, after);
      const source = d.added
        .filter(([k]) => k.startsWith("raw/"))
        .reduce((a, [, v]) => a + v.size, 0);
      const parquet = d.added
        .filter(([k]) => k.startsWith("parquet/"))
        .reduce((a, [, v]) => a + v.size, 0);
      const seg = await newSegmentBytes(u.versionId);
      const active = await activeVersionId(datasetId);
      const act = await referencedBytes({ versionIds: [active!] });
      log({
        n: i + 1,
        period: key,
        rows: n,
        csvMB: mb(u.size),
        mode: i === 0 ? "REPLACE" : "PERIOD",
        transferS: round(u.transferS),
        processS: round(u.processS),
        workerS: u.workerS === null ? null : round(u.workerS),
        confirmS: confirmed ? round(confirmed.confirmS) : null,
        totalS: round(u.transferS + u.processS + (confirmed?.confirmS ?? 0)),
        setupS: setupS === null ? null : round(setupS),
        evicted: confirmed?.evicted ?? [],
        segRows: seg.rows,
        periodParquetMB: mb(seg.raw + seg.typed),
        newParquetMB: mb(parquet),
        newSourceMB: mb(source),
        newVsPeriod: seg.raw + seg.typed ? round(parquet / (seg.raw + seg.typed), 3) : null,
        oldChanged: d.changed.length,
        oldRemoved: d.removed.length,
        activeMB: mb(act.bytes),
        bucketMB: mb(sum(after)),
      });
      await mark(String(i + 1));
    }

    // Setelah semua unggahan: retensi + GC + invarian, lalu bandingkan storage dengan yang dirujuk.
    const preList = await listDataset(datasetId);
    const m = await maintenance(datasetId);
    const postList = await listDataset(datasetId);
    const live = await prisma.datasetVersion.findMany({
      where: { datasetId, status: { not: "FAILED" } },
      select: { id: true },
    });
    const active = await activeVersionId(datasetId);
    const act = await referencedBytes({ versionIds: [active!] });
    const ref = await referencedBytes({ versionIds: live.map((v) => v.id) });
    const parquetKeys = [...postList.keys()].filter((k) => k.startsWith("parquet/"));
    const unreferenced = parquetKeys.filter((k) => !ref.keys.has(k));
    const missing = [...ref.keys.keys()].filter((k) => !postList.has(k));
    const dbAfter = await prisma.$queryRaw<
      { b: bigint }[]
    >`SELECT pg_database_size(current_database()) AS b`;
    const summary = {
      datasetId,
      uploads: total,
      liveVersions: live.length,
      beforeMaintenanceMB: mb(sum(preList)),
      afterMaintenanceMB: mb(sum(postList)),
      sourceAfterMB: mb(sum(postList, (k) => k.startsWith("raw/"))),
      activeMB: mb(act.bytes),
      referencedMB: mb(ref.bytes),
      savedOnlyMB: mb(ref.bytes - act.bytes),
      storageVsReferenced: ref.bytes ? round(sum(postList) / ref.bytes, 4) : null,
      unreferencedObjects: unreferenced.length,
      missingReferenced: missing.length,
      maintenance: m,
      dbGrowthMB: mb(Number(dbAfter[0]!.b) - Number(dbBefore[0]!.b)),
    };
    await mark("end");
    log({ summary });
    if (outPath) {
      writeFileSync(
        outPath,
        `${JSON.stringify({ steps, summary, checkpoints: marks }, null, 2)}\n`,
      );
    }
  } finally {
    if (!keep) {
      const r = await deleteDataset(owner.id, datasetId, name, IP);
      console.error(r.ok ? `dataset ${datasetId} dihapus` : `hapus dataset gagal: ${r.message}`);
    }
    await prisma.$disconnect();
  }
}

// Klien Redis/antrean (aktivasi, enqueue) tetap terbuka: keluar eksplisit setelah selesai.
main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.stack : String(e));
    process.exit(1);
  });
