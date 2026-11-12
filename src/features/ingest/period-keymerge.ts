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
import { rmSync } from "node:fs";
import { join } from "node:path";
import { lit, watched, type Duck } from "@/lib/duckdb";
import { IntegrityError } from "@/features/versions/integrity-check";
import type { ColumnSchema, SourceKind } from "./infer";
import type { MergePart } from "./period-plan";
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
export async function keyMerge(
  m: KeyMergeInput,
): Promise<{ copies: KeptCopy[]; parts: MergePart[] }> {
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
        const path = join(work, `old-${t}-${g.segmentId}-typed.parquet`);
        await m.download(src.typedKey, path);
        const cols = await columnsOf(d, path);
        if (sheet.keyColumns.every((p) => cols.has(`c${p}`))) {
          await watched(d, m.watch, () =>
            d.conn.run(
              `INSERT INTO ok_${t} SELECT ${lit(g.segmentId)}, _row, k FROM (SELECT _row, ${expr} AS k FROM read_parquet(${lit(path)})) WHERE k IS NOT NULL`,
            ),
          );
        }
        if (filePeriods.has(g.periodKey)) local.set(g.segmentId, path);
        else rmSync(path, { force: true });
        await m.watch();
      }
      await d.conn.run(
        `CREATE OR REPLACE TABLE hit_${t} AS SELECT o.seg, o.r, f.start AS nstart FROM ok_${t} o JOIN fk_${t} f USING (k)`,
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
    for (const [key, start] of [...touched].sort((x, y) => x[1].localeCompare(y[1]))) {
      const inP = old.filter((g) => g.periodKey === key);
      const sumOf = (f: "total" | "movedOut") =>
        inP.reduce((n, g) => n + (removed.get(g.segmentId)?.[f] ?? 0), 0);
      parts.push({
        key,
        start,
        lineageId,
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
  return { copies, parts };
}
