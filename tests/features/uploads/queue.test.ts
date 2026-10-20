import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MultipartStorage } from "@/lib/storage/multipart";

/*
 * Service antrean unggah (T-059) dengan Prisma palsu dalam memori (hanya kueri yang dipakai service):
 * pembuatan antrean (basi/sibuk/label/kuota, urutan seq), giliran (versi PERIOD dibuat dengan id yang
 * dipesan, versi dasar = aktif saat giliran, tanpa promosi ganda, gagal saat giliran → lanjut file
 * berikutnya), selesai unggah (QUEUED/FAILED lalu giliran), lewati, hentikan, dan scope pemilik.
 */
const MiB = 1024 * 1024;
const OWNER = "u-owner";
const OTHER = "u-other";
const DID = "cmv4klj5r0007oczvgiofocpg";
const ACTIVE = "cmv4kljx40009oczvaktif0001";

type Version = {
  id: string;
  datasetId: string;
  status: string;
  periodGrain: string | null;
  sheets: { periodSource: string | null }[];
  errorMessage: string | null;
  plan: unknown;
  uploadedById?: string | null;
  data?: Record<string, unknown>;
};
type Queue = {
  id: string;
  updatedAt: Date;
  datasetId: string;
  status: string;
  stoppedAt: Date | null;
  dismissedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  grouped: boolean;
  groupVersionId: string | null;
};
type Item = {
  id: string;
  queueId: string;
  seq: number;
  versionId: string;
  originalName: string;
  sizeBytes: bigint;
  lastModified: bigint;
  periodLabel: Date | null;
  uploadId: string | null;
  partSize: number;
  partCount: number;
  etag: string | null;
  completingAt: Date | null;
  state: string;
  message: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
};

const st = {
  dataset: { id: DID, ownerId: OWNER, activeVersionId: ACTIVE as string | null },
  versions: [] as Version[],
  queues: [] as Queue[],
  items: [] as Item[],
  seq: 0,
};
const nextId = () => `cmv4kljx40009oczv${String(++st.seq).padStart(8, "0")}`;

const matchState = (v: string, w: unknown) =>
  w === undefined || (typeof w === "string" ? v === w : (w as { in: string[] }).in.includes(v));
const itemMatch = (i: Item, w: Record<string, unknown>) => {
  if (w.id !== undefined) {
    const ids = typeof w.id === "string" ? [w.id] : (w.id as { in: string[] }).in;
    if (!ids.includes(i.id)) return false;
  }
  if (!matchState(i.state, w.state)) return false;
  if (w.uploadId !== undefined && i.uploadId !== w.uploadId) return false;
  const q = st.queues.find((x) => x.id === i.queueId)!;
  const qw = w.queue as { status?: string; dataset?: { ownerId?: string } } | undefined;
  if (qw?.status && q.status !== qw.status) return false;
  if (qw?.dataset?.ownerId && st.dataset.ownerId !== qw.dataset.ownerId) return false;
  return true;
};
const queueOut = (q: Queue) => ({
  ...q,
  dataset: { activeVersion: { periodGrain: activeVersion()?.periodGrain ?? null } },
  items: st.items.filter((i) => i.queueId === q.id).map((i) => ({ ...i })),
});
const activeVersion = () => st.versions.find((v) => v.id === st.dataset.activeVersionId);

const db = {
  $executeRaw: vi.fn(async () => 0),
  $queryRaw: vi.fn(async () => [{ activeVersionId: st.dataset.activeVersionId }]),
  dataset: {
    findFirst: vi.fn(async ({ where }: { where: { id: string; ownerId: string } }) =>
      where.id === st.dataset.id && where.ownerId === st.dataset.ownerId ? { id: DID } : null,
    ),
    findUnique: vi.fn(async () => ({ ownerId: st.dataset.ownerId })),
  },
  datasetVersion: {
    findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; status?: string } }) =>
      where.id ? st.versions.filter((v) => where.id!.in.includes(v.id)) : [],
    ),
    findUnique: vi.fn(
      async ({ where }: { where: { id: string } }) =>
        st.versions.find((v) => v.id === where.id) ?? null,
    ),
    findFirst: vi.fn(
      async ({ where }: { where: { status: { in: string[] } } }) =>
        st.versions.find((v) => where.status.in.includes(v.status)) ?? null,
    ),
    count: vi.fn(
      async ({ where }: { where: { status: { in: string[] }; id?: { notIn: string[] } } }) =>
        st.versions.filter(
          (v) => where.status.in.includes(v.status) && !(where.id?.notIn ?? []).includes(v.id),
        ).length,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (st.versions.some((v) => v.id === data.id)) throw new Error("unique id");
      st.versions.push({
        id: String(data.id),
        datasetId: DID,
        status: String(data.status),
        periodGrain: (data.periodGrain as string) ?? null,
        sheets: [],
        errorMessage: null,
        plan: null,
        data,
      });
      return { id: data.id };
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  uploadQueue: {
    count: vi.fn(
      async ({ where }: { where: { status: string } }) =>
        st.queues.filter((q) => q.status === where.status).length,
    ),
    create: vi.fn(
      async ({
        data,
      }: {
        data: {
          datasetId: string;
          grouped?: boolean;
          groupVersionId?: string;
          items: { create: Record<string, unknown>[] };
        };
      }) => {
        const q: Queue = {
          id: nextId(),
          datasetId: data.datasetId,
          grouped: data.grouped ?? false,
          groupVersionId: data.groupVersionId ?? null,
          status: "OPEN",
          stoppedAt: null,
          dismissedAt: null,
          finishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        st.queues.push(q);
        for (const c of data.items.create) {
          st.items.push({
            id: nextId(),
            queueId: q.id,
            versionId: nextId(),
            uploadId: null,
            etag: null,
            completingAt: null,
            state: "WAITING",
            message: null,
            startedAt: null,
            finishedAt: null,
            updatedAt: new Date(),
            ...(c as object),
          } as Item);
        }
        return { id: q.id };
      },
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const qs = st.queues.filter((q) => {
        if (where.id && q.id !== where.id) return false;
        if (where.status && q.status !== where.status) return false;
        const d = where.dataset as { ownerId?: string } | undefined;
        if (d?.ownerId && d.ownerId !== st.dataset.ownerId) return false;
        if (where.OR) return q.status === "OPEN" || (!q.dismissedAt && q.finishedAt);
        return true;
      });
      const q = qs[qs.length - 1];
      return q ? queueOut(q) : null;
    }),
    findMany: vi.fn(async () => st.queues.filter((q) => q.status === "OPEN")),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Queue> }) => {
      Object.assign(
        st.queues.find((q) => q.id === where.id)!,
        data,
      );
    }),
    updateMany: vi.fn(
      async ({ where, data }: { where: { id: string; status?: string }; data: Partial<Queue> }) => {
        const q = st.queues.find(
          (x) => x.id === where.id && (!where.status || x.status === where.status),
        );
        if (!q) return { count: 0 };
        Object.assign(q, data);
        return { count: 1 };
      },
    ),
  },
  uploadQueueItem: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const i = st.items.find((x) => itemMatch(x, where));
      if (!i) return null;
      const q = st.queues.find((x) => x.id === i.queueId)!;
      return {
        ...i,
        queue: {
          id: q.id,
          datasetId: q.datasetId,
          status: q.status,
          stoppedAt: q.stoppedAt,
          grouped: q.grouped,
          groupVersionId: q.groupVersionId,
        },
      };
    }),
    // Hanya kueri kedaluwarsa runUploadQueues: state + updatedAt file + updatedAt antrean OPEN.
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: {
          state: { in: string[] };
          updatedAt: { lt: Date };
          queue: { status: string; updatedAt: { lt: Date } };
        };
      }) =>
        st.items
          .filter((i) => {
            const q = st.queues.find((x) => x.id === i.queueId)!;
            return (
              where.state.in.includes(i.state) &&
              i.updatedAt < where.updatedAt.lt &&
              q.status === where.queue.status &&
              q.updatedAt < where.queue.updatedAt.lt
            );
          })
          .map((i) => {
            const q = st.queues.find((x) => x.id === i.queueId)!;
            return {
              ...i,
              queue: { datasetId: DID, grouped: q.grouped, groupVersionId: q.groupVersionId },
            };
          }),
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Partial<Item> }) => {
        const hit = st.items.filter((i) => itemMatch(i, where));
        for (const i of hit) Object.assign(i, { updatedAt: new Date() }, data);
        return { count: hit.length };
      },
    ),
  },
  $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(db)),
};
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/env", () => ({
  env: () => ({
    MAX_UPLOAD_BYTES: 1024 * MiB,
    USER_STORAGE_QUOTA_BYTES: 20 * 1024 * MiB,
    PERIOD_MAX_FILES: 3,
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/queue/versions", () => ({ enqueueIngest: vi.fn() }));
vi.mock("@/lib/storage/multipart", () => ({ s3Multipart: {} }));
const quotaDecision = vi.fn((..._a: unknown[]): unknown => ({ ok: true, warn: false }));
vi.mock("@/features/uploads/quota", () => ({
  userUsage: vi.fn(async () => ({ bytes: 0, legacyBytes: 0, unmeasured: 0 })),
  quotaGraceUntil: vi.fn(async () => null),
  quotaDecision: (...a: unknown[]) => quotaDecision(...a),
  formatGiB: (n: number) => `${n}`,
}));
const periodInitCheck = vi.fn(async (): Promise<unknown> => ({ ok: true, estimate: null }));
vi.mock("@/features/versions/period-capacity", () => ({
  periodInitCheck: (...a: unknown[]) => periodInitCheck(...(a as [])),
}));

const q = await import("@/features/uploads/queue");

function storage(over: Partial<MultipartStorage> = {}): MultipartStorage {
  return {
    create: vi.fn(async () => "up-1"),
    signPart: vi.fn(async () => "https://storage/x"),
    listParts: vi.fn(async () => [{ partNumber: 1, size: 5 * MiB, etag: '"a"' }]),
    complete: vi.fn(async () => '"e-1"'),
    abort: vi.fn(async () => {}),
    head: vi.fn(async () => ({ size: 5 * MiB, contentType: "text/csv" })),
    readHead: vi.fn(async () => new TextEncoder().encode("kode;tanggal\nA;2026-01-01\n")),
    remove: vi.fn(async () => {}),
    ...over,
  };
}

const file = (name: string, label: string | null = null, size = 5 * MiB) => ({
  name,
  size,
  lastModified: 1,
  label,
});
const create = (files = [file("april 2026.csv"), file("maret 2026.csv")], base = ACTIVE) =>
  q.createUploadQueue(OWNER, { datasetId: DID, baseVersionId: base, files }, storage());

function periodActive(source: "COLUMN" | "LABEL" = "COLUMN") {
  st.versions.push({
    id: ACTIVE,
    datasetId: DID,
    status: "READY",
    periodGrain: "MONTH",
    sheets: [{ periodSource: source }],
    errorMessage: null,
    plan: null,
  });
}

beforeEach(() => {
  st.dataset = { id: DID, ownerId: OWNER, activeVersionId: ACTIVE };
  st.versions = [];
  st.queues = [];
  st.items = [];
  quotaDecision.mockClear();
  db.datasetVersion.create.mockClear();
  periodInitCheck.mockReset();
  periodInitCheck.mockResolvedValue({ ok: true, estimate: null });
});

describe("createUploadQueue", () => {
  it("urutan periode dari server, seq 1..n, kuota dipesan untuk total ukuran", async () => {
    periodActive();
    const r = await create([file("april 2026.csv"), file("rusak.xlsx"), file("maret 2026.csv")]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.queue.items.map((i) => [i.seq, i.name, i.state])).toEqual([
      [1, "maret 2026.csv", "WAITING"],
      [2, "april 2026.csv", "WAITING"],
      [3, "rusak.xlsx", "WAITING"],
    ]);
    expect(r.queue.position).toBe(1);
    expect(quotaDecision.mock.calls[0]![1]).toBe(15 * MiB);
    // id versi dipesan berbeda per file.
    expect(new Set(st.items.map((i) => i.versionId)).size).toBe(3);
  });

  it("versi aktif berganti → STALE; antrean lain terbuka / versi non-terminal → DATASET_BUSY", async () => {
    periodActive();
    expect(await create(undefined, "cmv4kljx40009oczvlama00001")).toMatchObject({
      ok: false,
      code: "STALE",
    });
    expect((await create()).ok).toBe(true);
    expect(await create()).toMatchObject({ ok: false, code: "DATASET_BUSY" });
    st.queues = [];
    st.versions.push({ ...st.versions[0]!, id: "v-busy", status: "INGESTING" });
    expect(await create()).toMatchObject({ ok: false, code: "DATASET_BUSY" });
  });

  it("dataset bukan per periode → INVALID; bukan pemilik → NOT_FOUND", async () => {
    st.versions.push({
      id: ACTIVE,
      datasetId: DID,
      status: "READY",
      periodGrain: null,
      sheets: [],
      errorMessage: null,
      plan: null,
    });
    expect(await create()).toMatchObject({ ok: false, code: "INVALID" });
    const r = await q.createUploadQueue(OTHER, {
      datasetId: DID,
      baseVersionId: ACTIVE,
      files: [file("a.csv"), file("b.csv")],
    });
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("sheet berlabel: periode wajib, harus awal periode, satu file per periode", async () => {
    periodActive("LABEL");
    expect(await create([file("a.csv", "2026-01-01"), file("b.csv")])).toMatchObject({
      code: "INVALID",
      message: "Pilih periode untuk “b.csv”.",
    });
    expect(await create([file("a.csv", "2026-01-15"), file("b.csv", "2026-02-01")])).toMatchObject({
      code: "INVALID",
      message: "Periode “a.csv” tidak valid. Pilih periodenya lagi.",
    });
    const ok = await create([file("a.csv", "2026-02-01"), file("b.csv", "2026-01-01")]);
    expect(ok.ok && ok.queue.items.map((i) => [i.name, i.label])).toEqual([
      ["b.csv", "2026-01-01"],
      ["a.csv", "2026-02-01"],
    ]);
  });

  it("kuota tidak cukup untuk semua file → QUOTA_EXCEEDED, tidak ada antrean", async () => {
    periodActive();
    quotaDecision.mockReturnValueOnce({ ok: false, usedBytes: 1, projected: 2 });
    expect(await create()).toMatchObject({ ok: false, code: "QUOTA_EXCEEDED" });
    expect(st.queues).toHaveLength(0);
  });

  it("file tidak valid (format) ditolak dengan nama file", async () => {
    periodActive();
    expect(await create([file("a.pdf"), file("b.csv")])).toMatchObject({
      ok: false,
      code: "INVALID_FORMAT",
      message: "“a.pdf”: Hanya file .xlsx atau .csv yang bisa diunggah.",
    });
  });
});

describe("giliran antrean", () => {
  async function queued(n = 2, source: "COLUMN" | "LABEL" = "COLUMN") {
    periodActive(source);
    const files = Array.from({ length: n }, (_, i) =>
      file(`f${i + 1}.csv`, source === "LABEL" ? `2026-0${i + 1}-01` : null),
    );
    const r = await create(files);
    if (!r.ok) throw new Error(r.message);
    for (const i of st.items) Object.assign(i, { state: "QUEUED", etag: '"e"' });
    return st.items;
  }

  it("file pertama → versi PERIOD (id dipesan, dasar = aktif saat giliran), sekali saja", async () => {
    const items = await queued();
    const enqueue = vi.fn(async () => {});
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    const v = st.versions.find((x) => x.id === items[0]!.versionId)!;
    expect(v.data).toMatchObject({
      id: items[0]!.versionId,
      status: "UPLOADED",
      mode: "PERIOD",
      periodGrain: "MONTH",
      baseVersionId: ACTIVE,
      uploadedById: OWNER,
      sourceKey: `raw/${DID}/${items[0]!.versionId}/source.csv`,
      periodLabel: null,
    });
    expect(items[0]!.state).toBe("STARTED");
    expect(items[1]!.state).toBe("QUEUED");
    // Panggilan kedua: versi masih UPLOADED → antre ulang job yang sama, tidak membuat versi baru.
    expect(db.datasetVersion.create).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenNthCalledWith(1, items[0]!.versionId, DID);
    expect(enqueue).toHaveBeenNthCalledWith(2, items[0]!.versionId, DID);
  });

  it("versi selesai → hasil dicatat lalu file berikutnya; semua selesai → antrean DONE", async () => {
    const items = await queued();
    const enqueue = vi.fn(async () => {});
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    const v1 = st.versions.find((x) => x.id === items[0]!.versionId)!;
    v1.status = "FAILED";
    v1.errorMessage = "Kolom tidak cocok.";
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    expect(items[0]).toMatchObject({ state: "FAILED", message: "Kolom tidak cocok." });
    expect(items[1]!.state).toBe("STARTED");
    st.versions.find((x) => x.id === items[1]!.versionId)!.status = "READY";
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    expect(items[1]!.state).toBe("DONE");
    expect(st.queues[0]!.status).toBe("DONE");
  });

  it("menunggu tinjauan menahan file berikutnya; dibuang di tinjauan → dibatalkan, lanjut", async () => {
    const items = await queued();
    const enqueue = vi.fn(async () => {});
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    st.versions.find((x) => x.id === items[0]!.versionId)!.status = "AWAITING_CONFIRM";
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    expect(items[1]!.state).toBe("QUEUED");
    const view = await q.getUploadQueue(OWNER, DID);
    expect(view?.held).toMatchObject({ kind: "confirm", versionId: items[0]!.versionId });
    expect(view?.position).toBe(1);
    // "Batalkan upload": versi dihapus dan file dicatat dibatalkan di transaksi yang sama (service).
    st.versions = st.versions.filter((x) => x.id !== items[0]!.versionId);
    Object.assign(items[0]!, { state: "CANCELLED", message: "Dibatalkan di layar tinjauan" });
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    expect(items[0]!.state).toBe("CANCELLED");
    expect(items[1]!.state).toBe("STARTED");
  });

  it("review L5: versi gagal yang sudah dibersihkan retensi → file gagal, bukan dibatalkan", async () => {
    const items = await queued();
    const enqueue = vi.fn(async () => {});
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    st.versions = st.versions.filter((x) => x.id !== items[0]!.versionId);
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    expect(items[0]!.state).toBe("FAILED");
    expect(items[0]!.message).toMatch(/^Gagal diproses/);
  });

  it("gagal diperiksa saat giliran (batas periode) → file gagal, objeknya dibuang, file berikutnya jalan", async () => {
    const items = await queued(2, "LABEL");
    periodInitCheck.mockResolvedValueOnce({ ok: false, message: "Melewati batas 24 periode." });
    const s = storage();
    await q.advanceUploadQueue(DID, { storage: s, enqueue: vi.fn(async () => {}) });
    expect(items[0]).toMatchObject({ state: "FAILED", message: "Melewati batas 24 periode." });
    expect(s.remove).toHaveBeenCalledWith(`raw/${DID}/${items[0]!.versionId}/source.csv`);
    expect(items[1]!.state).toBe("STARTED");
    expect(st.versions.find((x) => x.id === items[1]!.versionId)!.data).toMatchObject({
      periodLabel: new Date("2026-02-01T00:00:00Z"),
    });
  });

  it("dataset tidak lagi per periode saat giliran → file gagal, bukan diturunkan ke ganti semua", async () => {
    const items = await queued();
    st.versions[0]!.periodGrain = null;
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue: vi.fn(async () => {}) });
    expect(items.map((i) => i.state)).toEqual(["FAILED", "FAILED"]);
    expect(st.versions.filter((v) => v.status === "UPLOADED")).toHaveLength(0);
    expect(st.queues[0]!.status).toBe("DONE");
  });

  it("dataset sibuk (versi lain non-terminal) → tidak ada promosi", async () => {
    const items = await queued();
    st.versions.push({ ...st.versions[0]!, id: "v-setup", status: "INGESTING" });
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue: vi.fn(async () => {}) });
    expect(items[0]!.state).toBe("QUEUED");
  });

  it("hentikan: file yang belum diproses dibatalkan (multipart di-abort), yang berjalan diselesaikan", async () => {
    const items = await queued(3);
    const enqueue = vi.fn(async () => {});
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    Object.assign(items[2]!, { state: "UPLOADING", uploadId: "up-9" });
    const s = storage();
    const r = await q.stopUploadQueue(OWNER, st.queues[0]!.id, { storage: s, enqueue });
    expect(r.ok).toBe(true);
    expect(items.map((i) => i.state)).toEqual(["STARTED", "CANCELLED", "CANCELLED"]);
    expect(s.abort).toHaveBeenCalledWith(`raw/${DID}/${items[2]!.versionId}/source.csv`, "up-9");
    expect(st.queues[0]!.status).toBe("OPEN");
    st.versions.find((x) => x.id === items[0]!.versionId)!.status = "READY";
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    expect(st.queues[0]!.status).toBe("CANCELLED");
    expect(await q.stopUploadQueue(OTHER, st.queues[0]!.id)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("unggah file antrean", () => {
  async function waiting() {
    periodActive();
    const r = await create();
    if (!r.ok) throw new Error(r.message);
    return st.items;
  }

  it("init → UPLOADING; complete → QUEUED lalu giliran langsung berjalan", async () => {
    const items = await waiting();
    const s = storage();
    const init = await q.initQueueItem(OWNER, items[0]!.id, s);
    expect(init).toMatchObject({ ok: true, uploadedParts: [], resumed: false, partCount: 1 });
    expect(items[0]).toMatchObject({ state: "UPLOADING", uploadId: "up-1" });
    const enqueue = vi.fn(async () => {});
    const done = await q.completeQueueItem(OWNER, items[0]!.id, { storage: s, enqueue });
    expect(done).toEqual({ ok: true, state: "QUEUED" });
    expect(items[0]!.state).toBe("STARTED");
    expect(enqueue).toHaveBeenCalledWith(items[0]!.versionId, DID);
    // Complete ulang (respons hilang): idempoten, tidak membuat versi kedua.
    expect(await q.completeQueueItem(OWNER, items[0]!.id, { storage: s, enqueue })).toEqual({
      ok: true,
      state: "STARTED",
    });
    expect(st.versions.filter((v) => v.id === items[0]!.versionId)).toHaveLength(1);
  });

  it("init ulang saat multipart masih ada → lanjut dari part yang ada", async () => {
    const items = await waiting();
    await q.initQueueItem(OWNER, items[0]!.id, storage());
    const again = await q.initQueueItem(OWNER, items[0]!.id, storage());
    expect(again).toMatchObject({ ok: true, uploadedParts: [1], resumed: true });
  });

  it("isi file bukan format yang benar → FAILED, antrean lanjut ke file berikutnya", async () => {
    const items = await waiting();
    const s = storage({ readHead: vi.fn(async () => new Uint8Array([0, 0, 0, 0])) });
    await q.initQueueItem(OWNER, items[0]!.id, s);
    const r = await q.completeQueueItem(OWNER, items[0]!.id, { storage: s, enqueue: vi.fn() });
    expect(r).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(items[0]!.state).toBe("FAILED");
    expect(s.remove).toHaveBeenCalled();
    // File 2 belum terunggah → antrean menunggu file 2 (bukan berhenti).
    const view = await q.getUploadQueue(OWNER, DID);
    expect(view?.position).toBe(2);
  });

  it("lewati: hanya file yang belum menjadi versi; alasan pra-cek = gagal dengan pesan server", async () => {
    const items = await waiting();
    expect(
      await q.skipQueueItem(OWNER, items[0]!.id, "INVALID_FORMAT", { storage: storage() }),
    ).toEqual({ ok: true, state: "FAILED" });
    expect(items[0]!.message).toMatch(/^Format file tidak valid/);
    expect(await q.skipQueueItem(OWNER, items[1]!.id, "<script>", { storage: storage() })).toEqual({
      ok: true,
      state: "CANCELLED",
    });
    expect(items[1]!.message).toBe("Dilewati pemilik.");
    expect(st.queues[0]!.status).toBe("DONE");
    expect(await q.skipQueueItem(OWNER, items[1]!.id, null)).toMatchObject({ code: "INVALID" });
  });

  it("review M1: kedaluwarsa 24 jam diukur dari aktivitas unggah antrean, bukan waktu file dibuat", async () => {
    const items = await waiting();
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    for (const i of items) i.updatedAt = old;
    st.queues[0]!.updatedAt = old;
    // File 1 sedang diunggah (init menyentuh antrean) → file 2 yang belum mulai tidak kedaluwarsa.
    await q.initQueueItem(OWNER, items[0]!.id, storage());
    expect(st.queues[0]!.updatedAt.getTime()).toBeGreaterThan(old.getTime());
    items[0]!.updatedAt = old;
    expect(
      await q.runUploadQueues({ storage: storage(), enqueue: vi.fn(async () => {}) }),
    ).toMatchObject({ expired: 0 });
    expect(items.map((i) => i.state)).toEqual(["UPLOADING", "WAITING"]);
    // Tanpa aktivitas 24 jam → keduanya gagal (multipart file 1 di-abort), antrean selesai.
    st.queues[0]!.updatedAt = old;
    const s = storage();
    expect(await q.runUploadQueues({ storage: s, enqueue: vi.fn(async () => {}) })).toMatchObject({
      expired: 2,
    });
    expect(items.map((i) => i.state)).toEqual(["FAILED", "FAILED"]);
    expect(items[0]!.message).toMatch(/24 jam/);
    expect(s.abort).toHaveBeenCalledWith(`raw/${DID}/${items[0]!.versionId}/source.csv`, "up-1");
  });

  it("file antrean milik orang lain → NOT_FOUND (init/tandatangan/selesai/lewati)", async () => {
    const items = await waiting();
    const id = items[0]!.id;
    expect(await q.initQueueItem(OTHER, id, storage())).toMatchObject({ code: "NOT_FOUND" });
    expect(await q.signQueueParts(OTHER, id, [1], storage())).toMatchObject({ code: "NOT_FOUND" });
    expect(await q.completeQueueItem(OTHER, id, { storage: storage() })).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await q.skipQueueItem(OTHER, id, null)).toMatchObject({ code: "NOT_FOUND" });
    expect(await q.getUploadQueue(OTHER, DID)).toBeNull();
  });
});

describe("T-060: kelompok file satu periode", () => {
  const createGroup = (files: ReturnType<typeof file>[]) =>
    q.createUploadQueue(
      OWNER,
      { datasetId: DID, baseVersionId: ACTIVE, files, group: true },
      storage(),
    );
  const three = () => [file("maret-2.csv"), file("maret-1.csv"), file("maret-3.csv")];

  it("AC2: kelompok > PERIOD_MAX_FILES → ditolak dengan pesan, tanpa antrean", async () => {
    periodActive();
    const r = await createGroup([...three(), file("maret-4.csv")]);
    expect(r).toMatchObject({
      ok: false,
      code: "LIMIT_REACHED",
      message: expect.stringContaining("Satu kelompok paling banyak 3 file, Anda memilih 4 file"),
    });
    expect(st.queues).toHaveLength(0);
    // Batas antrean biasa (36) tidak berubah: 4 file tanpa kelompok tetap boleh.
    expect((await create([...three(), file("maret-4.csv")])).ok).toBe(true);
  });

  it("sheet berlabel: semua file satu kelompok wajib satu periode", async () => {
    periodActive("LABEL");
    expect(
      await createGroup([file("a.csv", "2026-03-01"), file("b.csv", "2026-04-01")]),
    ).toMatchObject({
      ok: false,
      code: "INVALID",
      message: expect.stringMatching(/periode yang sama/),
    });
    const ok = await createGroup([file("a.csv", "2026-03-01"), file("b.csv", "2026-03-01")]);
    expect(ok.ok).toBe(true);
  });

  it("menunggu semua file terunggah, lalu SATU versi untuk seluruh kelompok (file di prefix versinya)", async () => {
    periodActive();
    const r = await createGroup(three());
    if (!r.ok) throw new Error(r.message);
    expect(r.queue.grouped).toBe(true);
    const gid = st.queues[0]!.groupVersionId!;
    expect(gid).toMatch(/^[a-z0-9]{25}$/);
    const items = [...st.items].sort((a, b) => a.seq - b.seq);
    expect(items.map((i) => i.originalName)).toEqual(["maret-1.csv", "maret-2.csv", "maret-3.csv"]);
    const enqueue = vi.fn(async () => {});
    // Dua dari tiga terunggah: belum ada versi.
    Object.assign(items[0]!, { state: "QUEUED", etag: '"e1"' });
    Object.assign(items[1]!, { state: "QUEUED", etag: '"e2"' });
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    expect(st.versions.filter((v) => v.id === gid)).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
    Object.assign(items[2]!, { state: "QUEUED", etag: '"e3"' });
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    expect(db.datasetVersion.create).toHaveBeenCalledTimes(1);
    const v = st.versions.find((x) => x.id === gid)!;
    expect(v.data).toMatchObject({
      status: "UPLOADED",
      mode: "PERIOD",
      baseVersionId: ACTIVE,
      originalName: "maret-1.csv + 2 file lain",
      sizeBytes: BigInt(15 * MiB),
      sourceKey: `raw/${DID}/${gid}/part-1.csv`,
      groupFiles: [1, 2, 3].map((n) => ({
        seq: n,
        key: `raw/${DID}/${gid}/part-${n}.csv`,
        name: `maret-${n}.csv`,
        size: 5 * MiB,
      })),
    });
    expect(items.map((i) => i.state)).toEqual(["STARTED", "STARTED", "STARTED"]);
    expect(enqueue).toHaveBeenNthCalledWith(1, gid, DID);
    expect(enqueue).toHaveBeenNthCalledWith(2, gid, DID);
    const view = await q.getUploadQueue(OWNER, DID);
    expect(view?.items.every((i) => i.versionId === gid && i.versionStatus === "UPLOADED")).toBe(
      true,
    );
    // Menunggu tinjauan → kelompok ditahan; diterapkan → semua file selesai, antrean DONE.
    v.status = "AWAITING_CONFIRM";
    expect((await q.getUploadQueue(OWNER, DID))?.held).toMatchObject({
      kind: "confirm",
      versionId: gid,
      name: "Kelompok 3 file",
    });
    v.status = "READY";
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue });
    expect(items.map((i) => i.state)).toEqual(["DONE", "DONE", "DONE"]);
    expect(st.queues[0]!.status).toBe("DONE");
  });

  it("satu file dilewati/gagal sebelum kelompok lengkap → semua file dibatalkan, tidak ada versi", async () => {
    periodActive();
    const r = await createGroup(three());
    if (!r.ok) throw new Error(r.message);
    const items = [...st.items].sort((a, b) => a.seq - b.seq);
    const gid = st.queues[0]!.groupVersionId!;
    Object.assign(items[0]!, { state: "QUEUED", etag: '"e1"' });
    const s = storage();
    expect(await q.skipQueueItem(OWNER, items[1]!.id, null, { storage: s })).toMatchObject({
      ok: true,
    });
    expect(items.map((i) => i.state)).toEqual(["CANCELLED", "CANCELLED", "CANCELLED"]);
    expect(items[0]!.message).toMatch(/Kelompok tidak diproses karena “maret-2.csv”/);
    expect(st.versions.some((v) => v.id === gid)).toBe(false);
    expect(s.remove).toHaveBeenCalledWith(`raw/${DID}/${gid}/part-1.csv`);
    expect(s.remove).toHaveBeenCalledWith(`raw/${DID}/${gid}/part-2.csv`);
    expect(st.queues[0]!.status).toBe("DONE");
  });

  it("gagal diperiksa saat giliran → seluruh kelompok gagal (tidak pernah sebagian)", async () => {
    periodActive();
    const r = await createGroup(three());
    if (!r.ok) throw new Error(r.message);
    for (const i of st.items) Object.assign(i, { state: "QUEUED", etag: '"e"' });
    periodInitCheck.mockResolvedValueOnce({ ok: false, message: "Melewati batas 24 periode." });
    await q.advanceUploadQueue(DID, { storage: storage(), enqueue: vi.fn(async () => {}) });
    expect(st.items.map((i) => [i.state, i.message])).toEqual([
      ["FAILED", "Melewati batas 24 periode."],
      ["FAILED", "Melewati batas 24 periode."],
      ["FAILED", "Melewati batas 24 periode."],
    ]);
    expect(st.versions.filter((v) => v.status === "UPLOADED")).toHaveLength(0);
    expect(st.queues[0]!.status).toBe("DONE");
  });

  it("unggah file kelompok memakai kunci part-<n> di prefix versi kelompok", async () => {
    periodActive();
    const r = await createGroup(three());
    if (!r.ok) throw new Error(r.message);
    const gid = st.queues[0]!.groupVersionId!;
    const it2 = st.items.find((i) => i.seq === 2)!;
    const s = storage();
    expect((await q.initQueueItem(OWNER, it2.id, s)).ok).toBe(true);
    expect(s.create).toHaveBeenCalledWith(`raw/${DID}/${gid}/part-2.csv`);
  });
});
