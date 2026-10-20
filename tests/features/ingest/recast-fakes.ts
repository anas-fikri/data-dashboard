import type { SheetPeriod } from "@/features/ingest/period";
import type { NewTyped, RecastRepo, RecastSheet } from "@/features/ingest/recast";
import { DS, VID, type FakeRepo } from "./fakes";

/* Repo recast di memori (T-040): segmen, file typed per revisi, dan manifest sheet seperti tabel
 * Segment/SegmentTyped/SheetSegment. Pointer/skema sheet tetap di FakeRepo (hasil ingest). */

export interface FakeSegment {
  id: string;
  rawKey: string;
  rowBase: bigint;
  maxSrcRow: number | null;
  headerRow: number;
  colCount: number;
  /** Peta kolom raw → posisi kanonik (T-gcn8); kosong = identitas. */
  colMap?: number[];
  /** Periode segmen (T-049). */
  periodKey?: string | null;
  periodStart?: string | null;
}

export interface FakeTyped extends Omit<
  NewTyped,
  "profile" | "dataRows" | "typedBytes" | "headerRow"
> {
  id: string;
  segmentId: string;
  dataRows: number | null;
  typedBytes: number | null;
  profile: unknown;
  /** null/undefined = Segment.headerRow (file sebelum T-gcn8). */
  headerRow?: number | null;
}

export class FakeRecastRepo implements RecastRepo {
  segments = new Map<string, FakeSegment>();
  typed = new Map<string, FakeTyped>();
  /** Manifest sheet: id file typed per ordinal. */
  manifest: string[] = [];
  /** Manifest versi lain yang berbagi segmen (rollback, AC 3): tidak pernah diubah recast. */
  others: string[][] = [];
  versionStatus = "READY";
  /** Mode periode sheet (T-049); null = non-periode. */
  period: SheetPeriod | null = null;
  source: "csv" | "xlsx" = "csv";
  calls = { saveProfile: [] as string[], addTyped: [] as string[], swap: 0 };
  private n = 0;

  constructor(
    readonly repo: FakeRepo,
    readonly sheetId: string,
  ) {}

  get sheet() {
    return this.repo.sheets.get(this.sheetId);
  }

  /** Satu segmen hasil ingest (manifest ordinal 0), kolom file "tidak diketahui" = semua kolom skema. */
  static fromIngest(repo: FakeRepo, sheetId: string): FakeRecastRepo {
    const f = new FakeRecastRepo(repo, sheetId);
    const s = repo.sheets.get(sheetId)!;
    const g = repo.segments.get(s.segmentId!)!;
    f.segments.set(g.id, {
      id: g.id,
      rawKey: g.rawKey,
      rowBase: g.rowBase,
      maxSrcRow: g.maxSrcRow,
      headerRow: g.headerRow,
      colCount: g.colCount,
    });
    f.manifest = [
      f.addRow({
        segmentId: g.id,
        typedKey: s.typedKey!,
        schemaRevision: s.schemaRevision ?? 1,
        columns: [],
        dataRows: null,
        typedBytes: null,
        profile: (s as { profile?: unknown }).profile ?? null,
      }),
    ];
    return f;
  }

  addRow(t: Omit<FakeTyped, "id">): string {
    const id = `typed${++this.n}`;
    this.typed.set(id, { id, ...t });
    return id;
  }

  /** File typed per ordinal manifest sheet sekarang. */
  manifestTyped(): FakeTyped[] {
    return this.manifest.map((id) => this.typed.get(id)!);
  }

  async loadSheet(id: string): Promise<RecastSheet | null> {
    const s = this.sheet;
    if (id !== this.sheetId || !s?.rawKey) return null;
    return {
      versionId: VID,
      datasetId: DS,
      versionStatus: this.versionStatus,
      name: s.name,
      typedKey: s.typedKey ?? null,
      schemaRevision: s.schemaRevision ?? 0,
      headerRow: s.headerRow,
      colCount: s.colCount,
      columns: s.columns,
      schema: s.schema ?? null,
      source: this.source,
      period: this.period,
      segments: this.manifestTyped().map((t, ordinal) => {
        const g = this.segments.get(t.segmentId)!;
        return {
          ordinal,
          segmentId: g.id,
          rawKey: g.rawKey,
          rowBase: g.rowBase,
          maxSrcRow: g.maxSrcRow,
          headerRow: t.headerRow ?? g.headerRow,
          colCount: g.colCount,
          colMap: g.colMap ?? [],
          periodKey: g.periodKey ?? null,
          periodStart: g.periodStart ?? null,
          typed: {
            id: t.id,
            typedKey: t.typedKey,
            columns: t.columns,
            profile: t.profile,
            dataRows: t.dataRows,
          },
        };
      }),
    };
  }

  async saveProfile(id: string, profile: unknown) {
    this.calls.saveProfile.push(id);
    this.typed.get(id)!.profile = profile;
  }

  async pendingTyped(segmentIds: string[], keys: string[]) {
    return [...this.typed.values()]
      .filter((t) => segmentIds.includes(t.segmentId) && keys.includes(t.typedKey))
      .map((t) => ({ id: t.id, typedKey: t.typedKey }));
  }

  async addTyped(segmentId: string, t: NewTyped) {
    const found = [...this.typed.values()].find(
      (x) => x.segmentId === segmentId && x.typedKey === t.typedKey,
    );
    if (found) return found.id;
    this.calls.addTyped.push(t.typedKey);
    return this.addRow({ segmentId, ...t });
  }

  referenced(id: string) {
    return this.manifest.includes(id) || this.others.some((m) => m.includes(id));
  }

  async dropTyped(ids: string[]) {
    const out: string[] = [];
    for (const id of ids) {
      const t = this.typed.get(id);
      if (t && !this.referenced(id)) {
        this.typed.delete(id);
        out.push(t.typedKey);
      }
    }
    return out;
  }

  swapTyped: RecastRepo["swapTyped"] = async (id, expected, next) => {
    this.calls.swap++;
    const s = this.sheet;
    if (id !== this.sheetId || !s || (s.schemaRevision ?? 0) !== expected) return false;
    if (next.manifest.some((m) => this.manifest[m.ordinal] !== m.from)) return false;
    if (next.manifest.some((m) => !this.typed.has(m.typedId))) throw new Error("FK SheetSegment");
    const sorted = [...next.manifest].sort((a, b) => a.ordinal - b.ordinal);
    this.manifest = sorted.map((m) => m.typedId);
    Object.assign(s, {
      typedKey: sorted[0]!.typedKey,
      schema: next.schema,
      schemaRevision: next.schemaRevision,
      headerRow: next.headerRow,
      columns: next.columns,
    });
    return true;
  };
}
