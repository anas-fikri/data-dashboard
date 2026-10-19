import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const { gcPlan, sweepTargets, SEGMENT_GC_GRACE_MS } = await import("@/features/versions/gc");
const { DATA_KEY, SEGMENT_PREFIX, newSegmentId, segmentPrefix } =
  await import("@/features/versions/segment-keys");
type Snapshot = Parameters<typeof gcPlan>[0];

/*
 * T-038: GC segmen mark-and-sweep. Rencana murni (siapa dirujuk, kapan disapu) dan simulasi berulang
 * AC 5: ingest → recast → retensi → GC → pembersihan → rollback dengan model storage — setelah setiap
 * langkah tidak ada kunci yang dirujuk versi hidup yang hilang, dan objek tak terujuk akhirnya habis.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const NOW = new Date("2026-10-20T00:00:00Z");
const H = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const seg = (id: string, over: Partial<Snapshot["segments"][number]> = {}) => ({
  id,
  createdByVersionId: null,
  unreferencedAt: null,
  rawKey: `${segmentPrefix(DS, id)}raw.parquet`,
  ...over,
});
const typed = (id: string, segmentId: string, over: Partial<Snapshot["typed"][number]> = {}) => ({
  id,
  segmentId,
  unreferencedAt: null,
  typedKey: `${segmentPrefix(DS, segmentId)}typed-1.parquet`,
  ...over,
});
const S = (n: number) => `cmv4kljx40009oczvdmpusg${String(n).padStart(3, "0")}`;

describe("gcPlan", () => {
  it("dirujuk = manifest versi hidup (aktif, READY, non-terminal) atau versi pembuat masih hidup", () => {
    const s: Snapshot = {
      versions: [
        { id: "vReady", status: "READY" },
        { id: "vIngest", status: "INGESTING" },
        { id: "vMap", status: "AWAITING_MAPPING" },
        { id: "vFail", status: "FAILED" },
      ],
      manifests: [
        { versionId: "vReady", typedId: "t1" },
        { versionId: "vMap", typedId: "t3" },
        { versionId: "vFail", typedId: "t4" },
      ],
      segments: [
        seg(S(1)),
        // Ingest yang belum menautkan manifest: dirujuk lewat versi pembuatnya.
        seg(S(2), { createdByVersionId: "vIngest" }),
        seg(S(3)),
        // Hanya dirujuk versi FAILED → tidak dirujuk.
        seg(S(4), { createdByVersionId: "vFail" }),
      ],
      typed: [typed("t1", S(1)), typed("t3", S(3)), typed("t4", S(4))],
    };
    expect(gcPlan(s, NOW)).toEqual({
      markSegments: [S(4)],
      markTyped: ["t4"],
      unmarkSegments: [],
      unmarkTyped: [],
      sweepSegments: [],
      sweepTyped: [],
    });
  });

  it("disapu hanya setelah tidak dirujuk ≥ 24 jam; dirujuk lagi → tanda dilepas", () => {
    const s: Snapshot = {
      versions: [{ id: "v", status: "READY" }],
      manifests: [{ versionId: "v", typedId: "tNew" }],
      segments: [
        seg(S(1), { unreferencedAt: ago(SEGMENT_GC_GRACE_MS) }),
        seg(S(2), { unreferencedAt: ago(SEGMENT_GC_GRACE_MS - 1) }),
        seg(S(3), { unreferencedAt: ago(H) }),
      ],
      typed: [
        typed("t1", S(1), { unreferencedAt: ago(SEGMENT_GC_GRACE_MS) }),
        typed("t2", S(2)),
        // Segmen 3 dirujuk lagi lewat revisi baru; revisi lama sudah lewat tenggang → disapu sendiri.
        typed("tOld", S(3), { unreferencedAt: ago(SEGMENT_GC_GRACE_MS + H) }),
        typed("tNew", S(3), { typedKey: `${segmentPrefix(DS, S(3))}typed-2-0123456789ab.parquet` }),
      ],
    };
    const p = gcPlan(s, NOW);
    expect(p.sweepSegments).toEqual([S(1)]);
    // Revisi milik segmen yang disapu ikut segmennya (tidak disapu dua kali).
    expect(p.sweepTyped).toEqual(["tOld"]);
    expect(p.markTyped).toEqual(["t2"]);
    expect(p.unmarkSegments).toEqual([S(3)]);
    expect(p.markSegments).toEqual([]);
  });

  it("sweepTargets: segmen seg/ = satu prefix; legacy = kunci persis raw + semua revisi; kunci asing tidak", () => {
    const LEGACY = "cmv4kljx40009oczvdmpulegcy";
    const VER = "cmv4kljx40009oczvdmpurrve";
    const SHEET = "cmv4kljx40009oczvdmpursht";
    const old = `parquet/${DS}/${VER}/${SHEET}/`;
    const s = {
      segments: [
        seg(S(1)),
        seg(LEGACY, { rawKey: `${old}raw.parquet` }),
        seg(S(9), { rawKey: "lain/x" }),
      ],
      typed: [
        typed("a", S(1)),
        typed("b", LEGACY, { typedKey: `${old}typed-1.parquet` }),
        typed("c", LEGACY, { typedKey: `${old}typed-2-0123456789ab.parquet` }),
        typed("d", S(2), { typedKey: `${segmentPrefix(DS, S(2))}typed-3-0123456789ab.parquet` }),
      ],
    };
    expect(
      sweepTargets(DS, s, { sweepSegments: [S(1), LEGACY, S(9)], sweepTyped: ["d"] }).sort(),
    ).toEqual(
      [
        segmentPrefix(DS, S(1)),
        `${old}raw.parquet`,
        `${old}typed-1.parquet`,
        `${old}typed-2-0123456789ab.parquet`,
        `${segmentPrefix(DS, S(2))}typed-3-0123456789ab.parquet`,
      ].sort(),
    );
  });

  it("pola kunci: id segmen baru berbentuk cuid; DATA_KEY/SEGMENT_PREFIX hanya file data", () => {
    const id = newSegmentId();
    expect(id).toMatch(/^c[0-9a-f]{24}$/);
    expect(SEGMENT_PREFIX.test(segmentPrefix(DS, id))).toBe(true);
    expect(DATA_KEY.test(`${segmentPrefix(DS, id)}raw.parquet`)).toBe(true);
    expect(DATA_KEY.test(`${segmentPrefix(DS, id)}typed-12-0123456789ab.parquet`)).toBe(true);
    expect(DATA_KEY.test(`${segmentPrefix(DS, id)}source.xlsx`)).toBe(false);
    expect(DATA_KEY.test(`raw/${DS}/${id}/source.csv`)).toBe(false);
    expect(() => segmentPrefix(DS, "../x")).toThrow();
  });
});

/**
 * Model kecil sistem: baris DB (versi, manifest, segmen, revisi) + objek storage. Operasi meniru kode
 * produksi (ingest/recast/retensi/rollback), GC memakai gcPlan + sweepTargets sungguhan, pembersihan
 * meniru isSafeToDelete (hapus hanya yang tidak lagi tercatat).
 */
class World {
  now = NOW.getTime();
  versions: { id: string; status: string; created: number }[] = [];
  active: string | null = null;
  manifests: { versionId: string; typedId: string }[] = [];
  segments: Snapshot["segments"] = [];
  typed: Snapshot["typed"] = [];
  objects = new Set<string>();
  cleanup: string[] = [];
  /** Objek yang benar-benar dihapus pembersihan (bukti simulasi menyapu sesuatu). */
  deleted = 0;
  private n = 0;
  private id(p: string) {
    return `${p}${String(++this.n).padStart(25 - p.length, "0")}`;
  }

  ingest(fail = false) {
    const v = this.id("cv");
    this.versions.push({ id: v, status: "INGESTING", created: this.now });
    const g = this.id("cs");
    this.segments.push({
      id: g,
      createdByVersionId: v,
      unreferencedAt: null,
      rawKey: `${segmentPrefix(DS, g)}raw.parquet`,
    });
    this.objects.add(`${segmentPrefix(DS, g)}raw.parquet`);
    const t = this.id("ct");
    const key = `${segmentPrefix(DS, g)}typed-1.parquet`;
    this.typed.push({ id: t, segmentId: g, unreferencedAt: null, typedKey: key });
    this.objects.add(key);
    this.manifests.push({ versionId: v, typedId: t });
    if (fail) {
      this.version(v).status = "FAILED";
      return;
    }
    this.version(v).status = "READY";
    this.activate(v);
  }

  /** Koreksi skema versi aktif: revisi typed baru, manifest pindah (revisi lama tetap tercatat). */
  recast() {
    if (!this.active) return;
    const m = this.manifests.find((x) => x.versionId === this.active)!;
    const g = this.typed.find((x) => x.id === m.typedId)!.segmentId;
    const t = this.id("ct");
    const key = `${segmentPrefix(DS, g)}typed-${this.n}-0123456789ab.parquet`;
    this.objects.add(key);
    this.typed.push({ id: t, segmentId: g, unreferencedAt: null, typedKey: key });
    m.typedId = t;
  }

  /** Aktivasi + retensi (3 READY terbaru + aktif; FAILED sebelum READY terbaru dibuang). */
  activate(v: string) {
    this.active = v;
    const ready = this.versions
      .filter((x) => x.status === "READY" && x.id !== v)
      .sort((a, b) => b.created - a.created);
    const newest = Math.max(
      ...this.versions.filter((x) => x.status === "READY").map((x) => x.created),
    );
    const victims = [
      ...ready.slice(3).map((x) => x.id),
      ...this.versions.filter((x) => x.status === "FAILED" && x.created < newest).map((x) => x.id),
    ];
    this.versions = this.versions.filter((x) => !victims.includes(x.id));
    this.manifests = this.manifests.filter((m) => !victims.includes(m.versionId));
    for (const g of this.segments) {
      if (g.createdByVersionId && victims.includes(g.createdByVersionId))
        g.createdByVersionId = null;
    }
  }

  rollback(pick: number) {
    const ready = this.versions.filter((x) => x.status === "READY" && x.id !== this.active);
    if (ready.length) this.activate(ready[pick % ready.length]!.id);
  }

  gc() {
    const now = new Date(this.now);
    const s: Snapshot = {
      versions: this.versions,
      manifests: this.manifests,
      segments: this.segments,
      typed: this.typed,
    };
    const p = gcPlan(s, now);
    const set = (
      ids: string[],
      rows: { id: string; unreferencedAt: Date | null }[],
      at: Date | null,
    ) => {
      for (const r of rows) if (ids.includes(r.id)) r.unreferencedAt = at;
    };
    set(p.markSegments, this.segments, now);
    set(p.markTyped, this.typed, now);
    set(p.unmarkSegments, this.segments, null);
    set(p.unmarkTyped, this.typed, null);
    this.cleanup.push(...sweepTargets(DS, s, p));
    const gone = new Set([
      ...p.sweepTyped,
      ...this.typed.filter((t) => p.sweepSegments.includes(t.segmentId)).map((t) => t.id),
    ]);
    this.manifests = this.manifests.filter((m) => !gone.has(m.typedId));
    this.typed = this.typed.filter((t) => !gone.has(t.id));
    this.segments = this.segments.filter((g) => !p.sweepSegments.includes(g.id));
  }

  /** storage-cleanup: hapus hanya yang tidak lagi tercatat (isSafeToDelete segmen/objek). */
  runCleanup() {
    const recorded = (k: string) =>
      this.segments.some((g) => g.rawKey.startsWith(k)) ||
      this.typed.some((t) => t.typedKey.startsWith(k));
    for (const k of this.cleanup.splice(0)) {
      if (recorded(k)) continue;
      for (const o of [...this.objects]) {
        if (o === k || (k.endsWith("/") && o.startsWith(k))) {
          this.objects.delete(o);
          this.deleted++;
        }
      }
    }
  }

  /** Semua kunci yang dirujuk versi hidup (yang dibaca query/rollback). */
  liveKeys(): string[] {
    const live = new Set(this.versions.filter((v) => v.status !== "FAILED").map((v) => v.id));
    return this.manifests
      .filter((m) => live.has(m.versionId))
      .flatMap((m) => {
        const t = this.typed.find((x) => x.id === m.typedId)!;
        const g = this.segments.find((x) => x.id === t.segmentId)!;
        return [t.typedKey, g.rawKey];
      });
  }

  version(id: string) {
    return this.versions.find((v) => v.id === id)!;
  }
}

describe("AC 5: retensi → GC → pembersihan → query → rollback berulang", () => {
  it("200 langkah acak (seed tetap): tidak ada kunci terujuk yang hilang; sisa tak terujuk akhirnya habis", () => {
    const w = new World();
    let seed = 38;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    w.ingest();
    for (let step = 0; step < 200; step++) {
      const r = rand();
      if (r < 0.25) w.ingest(rand() < 0.15);
      else if (r < 0.45) w.recast();
      else if (r < 0.6) w.rollback(Math.floor(rand() * 10));
      else if (r < 0.85) {
        w.gc();
        w.runCleanup();
      } else w.now += Math.floor(rand() * 30) * H; // waktu berjalan (kadang melewati tenggang)
      // Query versi aktif + rollback ke versi READY mana pun membaca kunci ini: semuanya harus ada.
      for (const k of w.liveKeys()) expect(w.objects.has(k), `langkah ${step}: ${k}`).toBe(true);
    }
    // Simulasi benar-benar menyapu (segmen versi terbuang + revisi lama recast), bukan lolos kosong.
    expect(w.deleted).toBeGreaterThan(20);
    // Setelah tenggang lewat, tiga putaran menyapu semua yang tidak dirujuk (tandai → sapu → hapus).
    for (let i = 0; i < 3; i++) {
      w.gc();
      w.now += SEGMENT_GC_GRACE_MS;
      w.gc();
      w.runCleanup();
    }
    expect([...w.objects].sort()).toEqual([...new Set(w.liveKeys())].sort());
  });
});
