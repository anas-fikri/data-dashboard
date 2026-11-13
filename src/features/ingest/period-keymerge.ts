/*
 * Tambah / Perbarui berdasarkan kunci (v1.20, T-rbrb, ADR-0011). Dijalankan worker setelah file typed
 * segmen baru ditulis LOKAL (belum diunggah): menentukan (periode, sheet data) yang ditulis ulang dan menyiapkan
 * salinan baris lama yang tetap. Periode yang ditulis ulang = kelompok segmen baru (T-060): bagian file +
 * salinan segmen lama tanpa baris yang tertimpa; manifest, gerbang integritas, Pulihkan dan riwayat versi
 * memakai mekanisme kelompok yang sudah ada.
 *
 * - Tambah: periode file yang sudah punya data → salinan utuh segmen lamanya (tanpa kunci).
 * - Perbarui: kunci = kolom pilihan pemilik (posisi kanonik), dibandingkan sebagai teks ter-trim dari nilai
 *   bertipe. Kunci kosong / ganda di file → ditolak dengan daftar (data aktif tidak berubah). Baris lama
 *   berkunci sama di periode MANA PUN dibuang (baris pindah periode bila tanggal barunya di periode lain).
 *   Pencarian kunci lama membaca file typed semua segmen aktif sheet data itu (kolom kunci saja).
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
import { lit, watched, type Duck } from "@/lib/duckdb";
import { IntegrityError } from "@/features/versions/integrity-check";
import type { ColumnSchema, SourceKind } from "./infer";
import type { MergePart } from "./period-plan";
import { combinedSha256 } from "./period-upload-plan";
import { packProfile, type StoredProfile } from "./profile";
import { copyParquet } from "./raw-writer";
import { canonicalProfile, profileRaw, typedFileProblems } from "./typed";
import { keySql } from "./period-key";

export { keySql };

/** Data segmen lama untuk disalin (Segment + SegmentTyped manifest aktif). */
export interface CopySource {
  typedId: string;
  segmentId: string;
  typedKey: string;
  schemaRevision: number;
  columns: number[];
  profile: unknown;
  typedHeaderRow: number;
  rawKey: string;
  rawRows: number;
  headerRow: number;
  colCount: number;
  colMap: number[];
  rowBase: bigint;
  maxSrcRow: number | null;
  sha256: string | null;
  sourceKind: SourceKind;
  originalName: string | null;
  minDate: string | null;
  maxDate: string | null;
  /** Pengunggah segmen asal (salinan tetap menyebut pengunggah aslinya, review L5). */
  uploadedById: string | null;
}

/** Sheet data aktif (bagian yang dibutuhkan penggabungan). */
export interface KeyMergeSheet {
  lineageId: string;
  name: string;
  colCount: number;
  schemaRevision: number;
  schema: ColumnSchema[];
  periodSource: "COLUMN" | "LABEL" | null;
  periodColumn: number | null;
  keyColumns: number[];
  segments: {
    typedId: string;
    segmentId: string;
    periodKey: string;
    periodStart: string;
    rows: number;
    sha256?: string | null;
  }[];
}

/** Segmen file baru (typed lokal) satu periode satu sheet data. */
export interface FileSeg {
  lineageId: string;
  key: string;
  start: string;
  typedPath: string;
  rows: number;
  /** Nama sheet (dan file, kelompok T-060) untuk pesan penolakan. */
  label: string;
  /** Sidik file/sheet asal (Tambah: file yang sama diunggah lagi → wajib ditinjau). */
  sha256?: string | null;
}

/** Salinan segmen lama (lokal) yang masuk kelompok periodenya. */
export interface KeptCopy {
  lineageId: string;
  key: string;
  start: string;
  src: CopySource;
  rawPath: string;
  typedPath: string;
  rows: number;
  rawRows: number;
  profile: StoredProfile;
  minDate: string | null;
  maxDate: string | null;
}

export interface KeyMergeInput {
  d: Duck;
  work: string;
  mode: "APPEND" | "UPSERT";
  sheets: KeyMergeSheet[];
  files: FileSeg[];
  sources: (typedIds: string[]) => Promise<CopySource[]>;
  download: (key: string, path: string) => Promise<unknown>;
  watch: () => Promise<void>;
  /** Indeks kunci lokal lintas job (T-yg3z): direktori + batas byte. Tidak ada = selalu unduh file typed. */
  keyCache?: { dir: string; maxBytes: number };
  /** Rentang `_row` baru untuk salinan yang dipadatkan (SheetLineage.rowHighWater). */
  allocateRows: (lineageId: string, span: number) => Promise<bigint>;
  /**
   * Tambah: file unggahan ini (sidik versi) sudah pernah diterapkan ke dataset — tetap terdeteksi setelah
   * pemadatan menghapus sidik per segmen (review putaran 2 M1).
   */
  repeatFile?: boolean;
}

/** Penolakan unggahan Perbarui (kunci kosong/ganda, kunci belum diatur): pesan untuk pemilik. */
export class KeyMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyMergeError";
  }
}

/** Contoh paling banyak di pesan penolakan (keputusan pemilik: daftar kunci yang dobel). */
export const KEY_EXAMPLES = 50;
const fmt = (n: number) => n.toLocaleString("id-ID");
const shown = (k: string) => k.split("\u001f").join(" · ");

const rowsOf = async (d: Duck, sql: string) =>
  (await d.conn.runAndReadAll(sql)).getRowObjects() as Record<string, unknown>[];

async function columnsOf(d: Duck, path: string): Promise<Set<string>> {
  const r = await rowsOf(d, `DESCRIBE SELECT * FROM read_parquet(${lit(path)})`);
  return new Set(r.map((x) => String(x.column_name)));
}

/**
 * Lihat komentar berkas. Melempar KeyMergeError (penolakan untuk pemilik) atau IntegrityError (bug/data
 * rusak). Tabel kerja DuckDB diberi akhiran per sheet data.
 */
/** Batasi indeks kunci lokal: berkas yang paling lama tidak dipakai dihapus dulu. */
export function trimKeyCache(dir: string, maxBytes: number): void {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".parquet"))
    .map((f) => {
      const st = statSync(join(dir, f));
      return { path: join(dir, f), size: st.size, at: st.mtimeMs };
    })
    .sort((a, b) => b.at - a.at);
  let total = 0;
  for (const f of files) {
    total += f.size;
    if (total > maxBytes) rmSync(f.path, { force: true });
  }
}

export async function keyMerge(
  m: KeyMergeInput,
): Promise<{ copies: KeptCopy[]; parts: MergePart[] }> {
  if (m.keyCache) mkdirSync(m.keyCache.dir, { recursive: true });
  const { d, work } = m;
  const copies: KeptCopy[] = [];
  const parts: MergePart[] = [];
  const problems: string[] = [];
  const lineages = [...new Set(m.files.map((f) => f.lineageId))];
  for (const [li, lineageId] of lineages.entries()) {
    const sheet = m.sheets.find((s) => s.lineageId === lineageId);
    if (!sheet) throw new IntegrityError([`sheet data ${lineageId} tidak ada di data aktif`]);
    const files = m.files.filter((f) => f.lineageId === lineageId);
    const filePeriods = new Map(files.map((f) => [f.key, f.start]));
    const t = `km${li}`;
    /** Baris lama yang tertimpa per segmen: _row typed + periode baris barunya. */
    const removed = new Map<string, { total: number; movedOut: number }>();
    const updated = new Map<string, number>();
    const collapsed = new Map<string, number>();
    const local = new Map<string, string>();

    if (m.mode === "UPSERT") {
      const keys = sheet.keyColumns.map((pos) => sheet.schema.find((c) => c.pos === pos));
      if (!sheet.keyColumns.length) {
        problems.push(
          `Sheet data “${sheet.name}” belum punya kolom kunci. Atur kolom kunci di Pengaturan periode, atau unggah dengan pilihan Ganti/Tambah.`,
        );
        continue;
      }
      if (keys.some((c) => !c || c.absent)) {
        problems.push(
          `Kolom kunci sheet data “${sheet.name}” tidak ada lagi di skema. Atur ulang kolom kunci di Pengaturan periode.`,
        );
        continue;
      }
      const names = keys.map((c) => `“${c!.name}”`).join(" + ");
      const expr = keySql(sheet.keyColumns);
      await d.conn.run(
        `CREATE OR REPLACE TABLE fk_${t} (part INTEGER, start VARCHAR, src BIGINT, k VARCHAR)`,
      );
      for (const [i, f] of files.entries()) {
        await watched(d, m.watch, () =>
          d.conn.run(
            `INSERT INTO fk_${t} SELECT ${i}, ${lit(f.start)}, _src_row, ${expr} FROM read_parquet(${lit(f.typedPath)})`,
          ),
        );
      }
      const [empty] = await rowsOf(d, `SELECT count(*) AS n FROM fk_${t} WHERE k IS NULL`);
      const emptyN = Number(empty!.n);
      if (emptyN > 0) {
        const ex = await rowsOf(
          d,
          `SELECT part, src FROM fk_${t} WHERE k IS NULL ORDER BY part, src LIMIT ${KEY_EXAMPLES}`,
        );
        const list = ex.map((r) => `${files[Number(r.part)]!.label} baris ${fmt(Number(r.src))}`);
        problems.push(
          `Kolom kunci ${names} kosong di ${fmt(emptyN)} baris${emptyN > ex.length ? ` (${fmt(ex.length)} pertama)` : ""}: ${list.join("; ")}.`,
        );
      }
      const [dupN] = await rowsOf(
        d,
        `SELECT count(*) AS n FROM (SELECT k FROM fk_${t} WHERE k IS NOT NULL GROUP BY k HAVING count(*) > 1)`,
      );
      const dups = Number(dupN!.n);
      if (dups > 0) {
        const ex = await rowsOf(
          d,
          `SELECT k, count(*) AS n FROM fk_${t} WHERE k IS NOT NULL GROUP BY k HAVING count(*) > 1
           ORDER BY n DESC, k LIMIT ${KEY_EXAMPLES}`,
        );
        const list = ex.map((r) => `${shown(String(r.k))} (${fmt(Number(r.n))}×)`);
        problems.push(
          `Sheet data “${sheet.name}”: ${fmt(dups)} kunci ${names} muncul lebih dari sekali di file${dups > ex.length ? ` (${fmt(ex.length)} pertama)` : ""}: ${list.join(", ")}.`,
        );
      }
      if (emptyN > 0 || dups > 0) continue;

      // Kunci lama: kolom kunci semua segmen aktif sheet data ini.
      await d.conn.run(`CREATE OR REPLACE TABLE ok_${t} (seg VARCHAR, r BIGINT, k VARCHAR)`);
      const srcs = new Map(
        (await m.sources(sheet.segments.map((g) => g.typedId))).map((x) => [x.typedId, x]),
      );
      for (const g of sheet.segments) {
        const src = srcs.get(g.typedId);
        if (!src)
          throw new IntegrityError([
            `sheet "${sheet.name}": file periode ${g.periodKey} tidak dikenal`,
          ]);
        // Indeks kunci lokal (T-yg3z M5): file typed tidak pernah berubah, jadi (_row, kunci) per file typed +
        // kolom kunci disimpan sekali; unggahan berikutnya tidak mengunduh ulang periode yang tidak disentuh.
        const cached = m.keyCache
          ? join(
              m.keyCache.dir,
              `${createHash("sha256")
                .update(`${src.typedKey}|${sheet.keyColumns.join(",")}`)
                .digest("hex")}.parquet`,
            )
          : null;
        const needFile = filePeriods.has(g.periodKey);
        if (cached && !needFile && existsSync(cached)) {
          const now = new Date();
          utimesSync(cached, now, now);
          await watched(d, m.watch, () =>
            d.conn.run(
              `INSERT INTO ok_${t} SELECT ${lit(g.segmentId)}, r, k FROM read_parquet(${lit(cached)})`,
            ),
          );
          await m.watch();
          continue;
        }
        const path = join(work, `old-${t}-${g.segmentId}-typed.parquet`);
        await m.download(src.typedKey, path);
        const cols = await columnsOf(d, path);
        const has = sheet.keyColumns.every((p) => cols.has(`c${p}`));
        const select = `SELECT CAST(_row AS BIGINT) AS r, k FROM (SELECT _row, ${expr} AS k FROM read_parquet(${lit(path)})) WHERE k IS NOT NULL`;
        if (cached) {
          // Tulis ke berkas sementara lalu ganti nama: pembaca lain tidak pernah melihat berkas setengah jadi.
          const tmp = `${cached}.${process.pid}.tmp`;
          await watched(d, m.watch, () =>
            copyParquet(
              d,
              has
                ? select
                : "SELECT CAST(NULL AS BIGINT) AS r, CAST(NULL AS VARCHAR) AS k WHERE false",
              tmp,
              2,
            ),
          );
          renameSync(tmp, cached);
        }
        if (has) {
          await watched(d, m.watch, () =>
            d.conn.run(`INSERT INTO ok_${t} SELECT ${lit(g.segmentId)}, r, k FROM (${select})`),
          );
        }
        if (needFile) local.set(g.segmentId, path);
        else rmSync(path, { force: true });
        await m.watch();
      }
      await d.conn.run(
        `CREATE OR REPLACE TABLE hit_${t} AS SELECT o.seg, o.r, o.k, f.start AS nstart FROM ok_${t} o JOIN fk_${t} f USING (k)`,
      );
      const startOf = new Map(sheet.segments.map((g) => [g.segmentId, g.periodStart]));
      for (const r of await rowsOf(
        d,
        `SELECT seg, nstart, count(*) AS n FROM hit_${t} GROUP BY 1, 2`,
      )) {
        const seg = String(r.seg);
        const cur = removed.get(seg) ?? { total: 0, movedOut: 0 };
        cur.total += Number(r.n);
        if (String(r.nstart) !== startOf.get(seg)) cur.movedOut += Number(r.n);
        removed.set(seg, cur);
      }
      for (const r of await rowsOf(
        d,
        `SELECT start, count(*) AS n FROM fk_${t} WHERE k IN (SELECT k FROM ok_${t}) GROUP BY 1`,
      )) {
        updated.set(String(r.start), Number(r.n));
      }
      // Baris lama berkunci dobel yang tertimpa (digabung menjadi satu baris file) per segmen (putaran 2 L4).
      for (const r of await rowsOf(
        d,
        `SELECT seg, count(*) AS n FROM hit_${t}
         WHERE k IN (SELECT k FROM ok_${t} GROUP BY k HAVING count(*) > 1) GROUP BY 1`,
      )) {
        collapsed.set(String(r.seg), Number(r.n));
      }
    }

    // (periode, sheet) yang ditulis ulang: periode file + periode yang kehilangan baris karena kuncinya pindah.
    const touched = new Map(filePeriods);
    for (const g of sheet.segments) {
      if (removed.has(g.segmentId)) touched.set(g.periodKey, g.periodStart);
    }
    const old = sheet.segments.filter((g) => touched.has(g.periodKey));
    const srcs = new Map(
      old.length ? (await m.sources(old.map((g) => g.typedId))).map((x) => [x.typedId, x]) : [],
    );
    const kept = new Map<string, number>();
    for (const g of old) {
      const src = srcs.get(g.typedId);
      if (!src)
        throw new IntegrityError([
          `sheet "${sheet.name}": file periode ${g.periodKey} tidak dikenal`,
        ]);
      if (src.schemaRevision !== sheet.schemaRevision) {
        throw new IntegrityError([
          `sheet "${sheet.name}" periode ${g.periodKey}: file typed revisi ${src.schemaRevision}, skema revisi ${sheet.schemaRevision}`,
        ]);
      }
      const gone = removed.get(g.segmentId)?.total ?? 0;
      const rows = g.rows - gone;
      if (rows < 0)
        throw new IntegrityError([
          `sheet "${sheet.name}" periode ${g.periodKey}: baris tertimpa melebihi isi segmen`,
        ]);
      kept.set(g.periodKey, (kept.get(g.periodKey) ?? 0) + rows);
      if (rows === 0) {
        const p = local.get(g.segmentId);
        if (p) rmSync(p, { force: true });
        continue;
      }
      const label = `sheet "${sheet.name}" periode ${g.periodKey} (salinan data lama)`;
      const typedIn = local.get(g.segmentId) ?? join(work, `old-${t}-${g.segmentId}-typed.parquet`);
      if (!local.has(g.segmentId)) await m.download(src.typedKey, typedIn);
      const rawIn = join(work, `old-${t}-${g.segmentId}-raw.parquet`);
      await m.download(src.rawKey, rawIn);
      let rawPath = rawIn;
      let typedPath = typedIn;
      if (gone > 0) {
        const drop = `SELECT r FROM hit_${t} WHERE seg = ${lit(g.segmentId)}`;
        rawPath = join(work, `keep-${t}-${g.segmentId}-raw.parquet`);
        typedPath = join(work, `keep-${t}-${g.segmentId}-typed.parquet`);
        const base = src.rowBase.toString();
        await watched(d, m.watch, () =>
          copyParquet(
            d,
            `SELECT * FROM read_parquet(${lit(rawIn)})
             WHERE CAST(_row AS BIGINT) + ${base}::BIGINT NOT IN (${drop}) ORDER BY _row`,
            rawPath,
            src.colCount + 1,
          ),
        );
        const width = (await columnsOf(d, typedIn)).size;
        await watched(d, m.watch, () =>
          copyParquet(
            d,
            `SELECT * FROM read_parquet(${lit(typedIn)}) WHERE _row NOT IN (${drop}) ORDER BY _row`,
            typedPath,
            width,
          ),
        );
        rmSync(rawIn, { force: true });
        rmSync(typedIn, { force: true });
      }
      const bad = await typedFileProblems(d, typedPath, rows, label, g.periodStart);
      if (bad.length) throw new IntegrityError(bad);
      const [rc] = await rowsOf(d, `SELECT count(*) AS n FROM read_parquet(${lit(rawPath)})`);
      let profile = src.profile as StoredProfile | null;
      let minDate = src.minDate;
      let maxDate = src.maxDate;
      if (gone > 0 || !profile) {
        const raw = await profileRaw(d, {
          rawPath,
          headerRow: src.headerRow,
          colCount: src.colCount,
          watch: m.watch,
        });
        if (raw.dataRows !== rows) {
          throw new IntegrityError([`${label}: ${raw.dataRows} baris raw, ${rows} baris typed`]);
        }
        profile = packProfile(
          src.typedHeaderRow,
          canonicalProfile(raw, src.colMap, sheet.colCount),
        );
        const pc = sheet.periodSource === "COLUMN" ? sheet.periodColumn : null;
        if (pc !== null) {
          const [mm] = await rowsOf(
            d,
            `SELECT strftime(min(CAST(c${Math.trunc(pc)} AS TIMESTAMP)), '%Y-%m-%d %H:%M:%S') AS lo,
                    strftime(max(CAST(c${Math.trunc(pc)} AS TIMESTAMP)), '%Y-%m-%d %H:%M:%S') AS hi
             FROM read_parquet(${lit(typedPath)})`,
          );
          minDate = (mm!.lo as string | null) ?? null;
          maxDate = (mm!.hi as string | null) ?? null;
        }
      }
      copies.push({
        lineageId,
        key: g.periodKey,
        start: g.periodStart,
        src,
        rawPath,
        typedPath,
        rows,
        rawRows: Number(rc!.n),
        profile,
        minDate,
        maxDate,
      });
      await m.watch();
    }
    // Pemadatan (review M1): salinan beberapa segmen lama satu periode digabung menjadi SATU segmen, jadi
    // jumlah segmen per periode tidak bertambah setiap unggahan (batas PERIOD_SHEET_MAX_SEGMENTS).
    const mine = copies.filter((x) => x.lineageId === lineageId);
    for (const group of new Set(mine.map((x) => `${x.key}|${x.src.sourceKind}`))) {
      // Per jenis sumber (csv/xlsx): cast ulang (recast) membaca raw menurut jenisnya (putaran 2 L3).
      const list = mine.filter((x) => `${x.key}|${x.src.sourceKind}` === group);
      if (list.length < 2) continue;
      const key = list[0]!.key;
      const one = await compact(
        m,
        sheet,
        list,
        `${t}_${key.replace(/[^0-9A-Za-z]/g, "")}_${list[0]!.src.sourceKind}`,
      );
      copies.splice(copies.indexOf(list[0]!), 1, one);
      for (const x of list.slice(1)) copies.splice(copies.indexOf(x), 1);
    }
    for (const [key, start] of [...touched].sort((x, y) => x[1].localeCompare(y[1]))) {
      const inP = old.filter((g) => g.periodKey === key);
      const sumOf = (f: "total" | "movedOut") =>
        inP.reduce((n, g) => n + (removed.get(g.segmentId)?.[f] ?? 0), 0);
      const fileShas = new Set(
        files.filter((f) => f.key === key && f.sha256).map((f) => f.sha256!),
      );
      parts.push({
        key,
        start,
        lineageId,
        // Tambah: file/sheet yang sama sudah pernah masuk periode ini → baris tergandakan, wajib ditinjau.
        repeat:
          m.mode === "APPEND" &&
          files.some((f) => f.key === key) &&
          (!!m.repeatFile || inP.some((g) => !!g.sha256 && fileShas.has(g.sha256))),
        collapsed: inP.reduce((n, g) => n + (collapsed.get(g.segmentId) ?? 0), 0),
        fileRows: files.filter((f) => f.key === key).reduce((n, f) => n + f.rows, 0),
        updated: updated.get(start) ?? 0,
        kept: kept.get(key) ?? 0,
        removed: sumOf("total"),
        movedOut: sumOf("movedOut"),
      });
    }
  }
  if (problems.length) {
    throw new KeyMergeError(
      `Unggahan “Perbarui berdasarkan kunci” ditolak. ${problems.join(" ")} Perbaiki file lalu unggah ulang. Data aktif tidak berubah.`,
    );
  }
  if (m.keyCache) trimKeyCache(m.keyCache.dir, m.keyCache.maxBytes);
  return { copies, parts };
}

/**
 * Satu segmen dari beberapa salinan satu periode (review M1): raw berlayout kanonik (c<pos> = posisi kanonik,
 * tanpa baris judul, `_row` 1..n urut segmen lalu baris), typed dengan `_row` baru (rentang baru lineage) dan
 * `_src_row` = nomor baris raw baru. Nilai typed disalin apa adanya (tanpa cast ulang). Jejak file asal per
 * baris (nama file + nomor baris) tidak dipertahankan — nama asal menyebut file pertama + jumlah file lain.
 */
async function compact(
  m: KeyMergeInput,
  sheet: KeyMergeSheet,
  list: KeptCopy[],
  tag: string,
): Promise<KeptCopy> {
  const { d, work } = m;
  const width = Math.max(1, Math.trunc(sheet.colCount));
  const rawSel = list.map((x, i) => {
    const cols = Array.from({ length: width }, (_, p) => {
      const pos = p + 1;
      const rc = x.src.colMap.length ? (x.src.colMap[pos - 1] ?? 0) : pos;
      return rc >= 1 && rc <= x.src.colCount
        ? `CAST(c${Math.trunc(rc)} AS VARCHAR) AS c${pos}`
        : `CAST(NULL AS VARCHAR) AS c${pos}`;
    });
    return `SELECT ${i} AS s, CAST(_row AS BIGINT) AS o, ${cols.join(", ")}
            FROM read_parquet(${lit(x.rawPath)}) WHERE _row > ${Math.trunc(x.src.typedHeaderRow)}`;
  });
  await watched(d, m.watch, () =>
    d.conn.run(
      `CREATE OR REPLACE TABLE cmp_${tag} AS
       SELECT row_number() OVER (ORDER BY s, o) AS nr, * FROM (${rawSel.join(" UNION ALL ")})`,
    ),
  );
  const [cnt] = await rowsOf(d, `SELECT count(*) AS n FROM cmp_${tag}`);
  const n = Number(cnt!.n);
  const rows = list.reduce((a, x) => a + x.rows, 0);
  if (n !== rows) {
    throw new IntegrityError([
      `sheet "${sheet.name}" periode ${list[0]!.key}: ${n} baris raw salinan, ${rows} baris typed`,
    ]);
  }
  const rowBase = await m.allocateRows(sheet.lineageId, n);
  const rawPath = join(work, `cmp-${tag}-raw.parquet`);
  const cs = Array.from({ length: width }, (_, p) => `c${p + 1}`);
  await watched(d, m.watch, () =>
    copyParquet(
      d,
      `SELECT CAST(nr AS BIGINT) AS _row, ${cs.join(", ")} FROM cmp_${tag} ORDER BY nr`,
      rawPath,
      width + 1,
    ),
  );
  // Typed: kolom gabungan semua salinan (kolom yang tidak ada di salinan lama = NULL), urut posisi.
  const columns = [...new Set(list.flatMap((x) => x.src.columns))].sort((a, b) => a - b);
  const present = await Promise.all(list.map((x) => columnsOf(d, x.typedPath)));
  const hasPeriod = present.every((c) => c.has("_period"));
  const typedSel = list.map((x, i) => {
    const cols = columns.filter((pos) => present[i]!.has(`c${pos}`)).map((pos) => `c${pos}`);
    return `SELECT ${i} AS s, CAST(_row AS BIGINT) - ${x.src.rowBase.toString()}::BIGINT AS o${hasPeriod ? ", _period" : ""}${cols.length ? `, ${cols.join(", ")}` : ""}
            FROM read_parquet(${lit(x.typedPath)})`;
  });
  const typedPath = join(work, `cmp-${tag}-typed.parquet`);
  const outCols = columns.map((pos) => `t.c${pos}`);
  await watched(d, m.watch, () =>
    copyParquet(
      d,
      `SELECT CAST(c.nr AS BIGINT) + ${rowBase.toString()}::BIGINT AS _row, CAST(c.nr AS BIGINT) AS _src_row${hasPeriod ? ", t._period" : ""}${outCols.length ? `, ${outCols.join(", ")}` : ""}
       FROM (${typedSel.join(" UNION ALL BY NAME ")}) t JOIN cmp_${tag} c ON c.s = t.s AND c.o = t.o
       ORDER BY c.nr`,
      typedPath,
      columns.length + 3,
    ),
  );
  await d.conn.run(`DROP TABLE IF EXISTS cmp_${tag}`);
  const start = list[0]!.start;
  const label = `sheet "${sheet.name}" periode ${list[0]!.key} (salinan dipadatkan)`;
  const bad = await typedFileProblems(d, typedPath, rows, label, hasPeriod ? start : null);
  if (bad.length) throw new IntegrityError(bad);
  const raw = await profileRaw(d, { rawPath, headerRow: 0, colCount: width, watch: m.watch });
  if (raw.dataRows !== rows) {
    throw new IntegrityError([`${label}: ${raw.dataRows} baris raw, ${rows} baris typed`]);
  }
  for (const x of list) {
    rmSync(x.rawPath, { force: true });
    rmSync(x.typedPath, { force: true });
  }
  const first = list[0]!;
  const names = [
    ...new Set(list.map((x) => (x.src.originalName ?? "").replace(/ \(\+\d+ file lain\)$/, ""))),
  ].filter(Boolean);
  const dates = list.flatMap((x) => [x.minDate, x.maxDate]).filter((v): v is string => !!v);
  const src: CopySource = {
    ...first.src,
    columns,
    profile: null,
    typedHeaderRow: 0,
    rawRows: n,
    headerRow: 0,
    colCount: width,
    colMap: [],
    rowBase,
    maxSrcRow: n,
    sha256: combinedSha256(list.map((x) => x.src.sha256)) ?? first.src.sha256,
    originalName:
      names.length > 1 ? `${names[0]} (+${names.length - 1} file lain)` : (names[0] ?? null),
  };
  return {
    lineageId: first.lineageId,
    key: first.key,
    start,
    src,
    rawPath,
    typedPath,
    rows,
    rawRows: n,
    profile: packProfile(0, raw),
    minDate: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null,
    maxDate: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
  };
}
