/*
 * Database dan storage palsu untuk test ingest (parser + DuckDB tetap sungguhan). FakeRepo meniru
 * Prisma: dataset dihapus → baris versi/sheet ikut hilang (kaskade) dan tulis berikutnya gagal.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import yazl from "yazl";
import {
  DatasetGoneError,
  type FinishOutcome,
  type IngestProgress,
  type IngestRepo,
  type IngestStorage,
  type SheetRecord,
} from "@/features/ingest/ingest";
import type { ColumnSchema } from "@/features/ingest/infer";
import {
  sameSnapshot,
  snapshotRef,
  type ActiveSnapshot,
  type SnapshotRef,
  type Verdict,
} from "@/features/ingest/refresh";

export const DS = "cmv4klj5r0007oczvgiofocpg";
export const VID = "cmv4kljx40009oczvdmpurrxf";

export class FakeStorage implements IngestStorage {
  constructor(
    readonly dir: string,
    readonly sources: Record<string, string>,
  ) {
    mkdirSync(dir, { recursive: true });
  }
  failUploadOnce: number | null = null;
  private uploads = 0;
  async download(key: string, dest: string) {
    // Sumber unggahan, atau objek yang sudah diunggah (recast mengunduh raw.parquet).
    copyFileSync(this.sources[key] ?? join(this.dir, key), dest);
    const buf = readFileSync(dest);
    return { sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
  }
  async upload(key: string, path: string, _contentType?: string) {
    this.uploads++;
    if (this.failUploadOnce === this.uploads) {
      this.failUploadOnce = null;
      throw new Error("ECONNRESET storage");
    }
    const dest = join(this.dir, key);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(path, dest);
  }
  async deletePrefix(prefix: string) {
    const target = join(this.dir, prefix);
    if (!existsSync(target)) return 0;
    const n = this.keys().filter((k) => k.startsWith(prefix)).length;
    rmSync(target, { recursive: true, force: true });
    return n;
  }
  keys(): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
      if (!existsSync(d)) return;
      for (const f of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, f.name);
        if (f.isDirectory()) walk(p);
        else out.push(relative(this.dir, p));
      }
    };
    walk(this.dir);
    return out.sort();
  }
  parquetKeys() {
    return this.keys().filter((k) => k.startsWith("parquet/"));
  }
}

export type FakeSheet = SheetRecord & {
  rawKey: string | null;
  typedKey?: string;
  schema?: ColumnSchema[];
  schemaRevision?: number;
};

export class FakeRepo implements IngestRepo {
  status = "UPLOADED";
  stage: string | null = null;
  sha256: string | null = null;
  error: string | null = null;
  alive = () => true;
  progressLog: IngestProgress[] = [];
  sheets = new Map<string, FakeSheet>();
  cleanups: string[] = [];
  /** Versi aktif dataset (null = versi pertama); load memberi salinan seperti baris DB. */
  active: ActiveSnapshot | null = null;
  activated = false;
  private n = 0;
  constructor(readonly sourceKey: string) {}
  async load() {
    if (!this.alive()) return null;
    return { datasetId: DS, sourceKey: this.sourceKey, active: structuredClone(this.active) };
  }
  async begin() {
    if (!["UPLOADED", "INGESTING"].includes(this.status)) return false;
    this.status = "INGESTING";
    return true;
  }
  async exists() {
    return this.alive();
  }
  async progress(_v: string, p: IngestProgress) {
    this.progressLog.push(p);
  }
  async deleteSheets() {
    this.sheets.clear();
  }
  async createSheet(_v: string, s: SheetRecord) {
    if (!this.alive()) throw new DatasetGoneError();
    const id = `sheet${++this.n}`;
    this.sheets.set(id, { ...s, rawKey: null });
    return id;
  }
  async setSheetKey(id: string, key: string) {
    if (!this.alive()) {
      this.sheets.clear();
      throw new DatasetGoneError();
    }
    this.sheets.get(id)!.rawKey = key;
  }
  async recordCleanup(prefix: string) {
    this.cleanups.push(prefix);
  }
  async setTyped(
    id: string,
    d: { typedKey: string; schema: ColumnSchema[]; schemaRevision: number },
  ) {
    if (!this.alive()) {
      this.sheets.clear();
      throw new DatasetGoneError();
    }
    Object.assign(this.sheets.get(id)!, d);
  }
  /** Meniru finish Prisma: acuan cast dibandingkan dengan `active` saat ini (bisa diubah uji). */
  async finish(
    _v: string,
    d: { sha256: string; verdict: Verdict; snapshot: SnapshotRef },
  ): Promise<FinishOutcome> {
    if (!this.alive()) return "gone";
    if (!sameSnapshot(d.snapshot, snapshotRef(this.active))) return "stale";
    if (this.status !== "INGESTING") return "gone";
    this.stage = "typed";
    this.sha256 = d.sha256;
    if (!d.verdict.ok) {
      this.status = "AWAITING_MAPPING";
      this.error = d.verdict.reason;
      return "awaiting";
    }
    this.status = "READY";
    this.error = null;
    this.activated = true;
    return "activated";
  }
  async fail(_v: string, message: string) {
    this.status = "FAILED";
    this.error = message;
  }
  byIndex(): FakeSheet[] {
    return [...this.sheets.values()].sort((a, b) => a.index - b.index);
  }
}

/** Akar temp per file test; panggil cleanup() di afterAll. */
export function testRoot(name: string) {
  const root = mkdtempSync(join(tmpdir(), `dd-${name}-`));
  mkdirSync(join(root, "tmp"), { recursive: true });
  let seq = 0;
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    resetTmp: () => {
      rmSync(join(root, "tmp"), { recursive: true, force: true });
      mkdirSync(join(root, "tmp"), { recursive: true });
    },
    setup(fixture: string) {
      const ext = fixture.endsWith(".csv") ? "csv" : "xlsx";
      const sourceKey = `raw/${DS}/${VID}/source.${ext}`;
      const storage = new FakeStorage(join(root, `store-${++seq}`), { [sourceKey]: fixture });
      const repo = new FakeRepo(sourceKey);
      return { storage, repo, opts: { tmpRoot: join(root, "tmp"), duckMemory: "256MB" } };
    },
    /** Tulis file ke akar test lalu kembalikan path-nya. */
    file(name: string, content: string | Buffer) {
      const p = join(root, name);
      writeFileSync(p, content);
      return p;
    },
  };
}

export async function readParquet(path: string): Promise<unknown[][]> {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    const r = await c.runAndReadAll(
      `SELECT * FROM read_parquet('${path.replace(/'/g, "''")}') ORDER BY _row`,
    );
    return r.getRowsJS() as unknown[][];
  } finally {
    c.closeSync();
    db.closeSync();
  }
}

/**
 * xlsx minimal dari XML sheetData per sheet. dateStyle: tambah styles.xml dengan cellXfs[1] =
 * numFmtId 14 (tanggal bawaan Excel) dan cellXfs[2] = format kustom "[h]:mm" (durasi), sehingga sel
 * `s="1"`/`s="2"` berisi nomor seri terbaca sebagai tanggal.
 */
export async function buildXlsx(
  sheets: { name: string; xml: string }[],
  opts: { dateStyle?: boolean } = {},
): Promise<Buffer> {
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
  const zip = new yazl.ZipFile();
  const add = (name: string, body: string) => zip.addBuffer(Buffer.from(body), name);
  add(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="${PKG}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}${opts.dateStyle ? `<Relationship Id="rIdS" Type="${REL}/styles" Target="styles.xml"/>` : ""}</Relationships>`,
  );
  if (opts.dateStyle) {
    add(
      "xl/styles.xml",
      `<?xml version="1.0"?><styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="[h]:mm"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    );
  }
  sheets.forEach((s, i) =>
    add(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet xmlns="${NS}"><sheetData>${s.xml}</sheetData></worksheet>`,
    ),
  );
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export const colLetter = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};
