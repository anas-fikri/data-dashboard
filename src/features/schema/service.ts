/*
 * Status ingest, review skema, dan koreksi (T-008, alur B3). Hanya pemilik dataset; sheet selalu
 * di-resolve lewat versi aktif dataset miliknya (sheet dataset lain → NOT_FOUND). Dependensi diinjeksi
 * (repo, mesin query, antrean, rate limit) agar bisa diuji tanpa layanan; perakitan produksi di
 * runtime.ts.
 *
 * Koreksi tidak langsung mengubah skema: input divalidasi lalu masuk antrean recast (worker menulis
 * typed-<rev+1> dari raw.parquet, tanpa membaca file asli). baseRevision wajib: edit dari tampilan
 * lama ditolak (STALE) alih-alih menimpa edit yang lebih baru.
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import type { IngestProgress } from "@/features/ingest/ingest";
import type { SheetPreview } from "@/features/ingest/preview";
import {
  parseRecastInput,
  type RecastInput,
  type RecastOutcome,
} from "@/features/ingest/recast-input";
import { execOnParquet, toJson, type QueryDeps, type QueryFailure } from "@/features/query/service";

/** Baris sampel typed per sheet (AC 2) dan batas lebar/panjang sel yang dikirim ke browser. */
export const SAMPLE_ROWS = 50;
export const SAMPLE_COLS = 60;
export const SAMPLE_TEXT_CHARS = 200;

export type VersionStatus =
  "UPLOADING" | "UPLOADED" | "INGESTING" | "AWAITING_MAPPING" | "READY" | "FAILED";

export interface IngestStatus {
  versionId: string;
  status: VersionStatus;
  fileName: string | null;
  progress: IngestProgress | null;
  /** Sheet yang sudah tersimpan mentah (raw), urut indeks. */
  sheets: { index: number; name: string; rawRows: number; typed: boolean }[];
  errorMessage: string | null;
}

export interface SheetView {
  id: string;
  index: number;
  name: string;
  rawRows: number;
  colCount: number;
  headerRow: number;
  truncatedCells: number;
  schemaRevision: number;
  schema: ColumnSchema[] | null;
  preview: SheetPreview | null;
}

export interface SchemaView {
  datasetId: string;
  datasetName: string;
  /** Versi aktif (data yang dipakai dashboard); null bila belum ada data siap. */
  version: { id: string; fileName: string | null } | null;
  sheets: SheetView[];
}

export interface SchemaRepo {
  /** Versi terbaru dataset milik user yang sudah lewat tahap unggah, atau null (404/belum ada). */
  latestVersion(userId: string, datasetId: string): Promise<IngestStatus | null | "none">;
  schemaView(userId: string, datasetId: string): Promise<SchemaView | null>;
  /** Sheet milik user di versi aktif dataset-nya; null = tidak ada/bukan pemilik/bukan versi aktif. */
  ownedActiveSheet(
    userId: string,
    sheetId: string,
  ): Promise<{
    colCount: number;
    schemaRevision: number;
    headerRow: number;
    schema: ColumnSchema[] | null;
    versionStatus: VersionStatus;
  } | null>;
}

export interface RecastJobView {
  sheetId: string;
  state: "waiting" | "delayed" | "active" | "completed" | "failed" | "unknown";
  result: RecastOutcome | { outcome: "done"; revision: number } | null;
}

export interface SchemaDeps {
  repo: SchemaRepo;
  rateLimit(userId: string): Promise<{ allowed: boolean; retryAfterSec: number }>;
  enqueue(sheetId: string, input: RecastInput): Promise<string>;
  job(jobId: string): Promise<RecastJobView | null>;
}

export type SchemaCode =
  "INVALID" | "NOT_FOUND" | "NOT_READY" | "NO_CHANGE" | "STALE" | "RATE_LIMITED";

type Fail = { ok: false; code: SchemaCode; message: string; retryAfterSec?: number };
const fail = (code: SchemaCode, message: string): Fail => ({ ok: false, code, message });

const ID = /^[a-z0-9]{20,32}$/;
const JOB_ID = /^\d{1,20}$/;

// --- status ingest (AC 1) ---

/** Status versi terbaru untuk polling halaman profil; "none" = dataset belum punya unggahan. */
export async function ingestStatus(
  userId: string,
  datasetId: unknown,
  repo: Pick<SchemaRepo, "latestVersion">,
): Promise<IngestStatus | "none" | null> {
  if (typeof datasetId !== "string" || !ID.test(datasetId)) return null;
  return repo.latestVersion(userId, datasetId);
}

// --- sampel typed (AC 2) ---

export type SampleResult =
  | {
      ok: true;
      /** Kolom yang ditampilkan (≤ SAMPLE_COLS pertama), urut posisi. */
      columns: { pos: number; name: string; type: ColumnSchema["type"]; hidden: boolean }[];
      /** Kolom pertama = nomor baris fisik. */
      rows: unknown[][];
      totalColumns: number;
    }
  | QueryFailure;

/** SQL sampel: posisi kolom berasal dari skema di DB (bilangan bulat), bukan dari input user. */
export function sampleSql(columns: Pick<ColumnSchema, "pos" | "type">[]): string {
  const cols = columns.map((c) => {
    const id = `c${Math.trunc(c.pos)}`;
    return c.type === "text" ? `left(${id}, ${SAMPLE_TEXT_CHARS}) AS ${id}` : id;
  });
  // Tanpa ORDER BY: typed.parquet ditulis urut _row dan urutan sisip dipertahankan, jadi LIMIT membaca
  // row group pertama saja (top-N atas semua kolom kehabisan memori di tabel lebar).
  return `SELECT ${["_row", ...cols].join(", ")} FROM read_parquet($path) LIMIT ${SAMPLE_ROWS}`;
}

export async function sampleRows(
  userId: string,
  datasetId: unknown,
  sheetId: unknown,
  deps: QueryDeps,
): Promise<SampleResult> {
  const notFound: QueryFailure = {
    ok: false,
    code: "NOT_FOUND",
    message: "Sheet tidak ditemukan.",
  };
  if (typeof datasetId !== "string" || typeof sheetId !== "string") return notFound;
  if (!ID.test(datasetId) || !ID.test(sheetId)) return notFound;
  const ds = await deps.repo.ownedDataset(userId, datasetId);
  if (!ds?.activeVersionId) return notFound;
  const sheet = await deps.repo.sheet(ds.activeVersionId, sheetId);
  if (!sheet) return notFound;
  if (!sheet.typedKey || !sheet.schema) {
    return { ok: false, code: "NOT_READY", message: "Sheet ini belum siap." };
  }
  const shown = [...sheet.schema].sort((a, b) => a.pos - b.pos).slice(0, SAMPLE_COLS);
  const r = await execOnParquet(userId, sheet.typedKey, deps, (path) => ({
    sql: sampleSql(shown),
    params: { path },
  }));
  if (!r.ok) return r;
  const types = ["integer" as const, ...shown.map((c) => c.type)];
  return {
    ok: true,
    columns: shown.map((c) => ({ pos: c.pos, name: c.name, type: c.type, hidden: c.hidden })),
    rows: r.out.rows.map((row) => row.map((v, i) => toJson(v, types[i]!))),
    totalColumns: sheet.schema.length,
  };
}

// --- koreksi (AC 3–5) ---

/** Hanya kolom yang benar-benar berubah dari skema sekarang (nama sama/tipe sama tidak dikirim). */
export function changedColumns(
  schema: ColumnSchema[],
  edits: NonNullable<RecastInput["columns"]>,
): NonNullable<RecastInput["columns"]> {
  const byPos = new Map(schema.map((c) => [c.pos, c]));
  const out: NonNullable<RecastInput["columns"]> = [];
  for (const e of edits) {
    const cur = byPos.get(e.pos);
    if (!cur) {
      out.push(e);
      continue;
    }
    const d: (typeof out)[number] = { pos: e.pos };
    if (e.name !== undefined && e.name.trim() !== cur.name) d.name = e.name.trim();
    if (e.type !== undefined && e.type !== cur.type) d.type = e.type;
    if (e.numberLocale !== undefined && e.numberLocale !== cur.numberLocale) {
      d.numberLocale = e.numberLocale;
    }
    if (e.dateFormat !== undefined && e.dateFormat !== cur.dateFormat) d.dateFormat = e.dateFormat;
    if (e.hidden !== undefined && e.hidden !== cur.hidden) d.hidden = e.hidden;
    if (Object.keys(d).length > 1) out.push(d);
  }
  return out;
}

/** Nama tampil akhir yang dipakai lebih dari sekali (tidak peka kapital), atau null. */
function duplicateName(
  schema: ColumnSchema[],
  changes: NonNullable<RecastInput["columns"]>,
): string | null {
  const names = new Map(schema.map((c) => [c.pos, c.name]));
  for (const c of changes) if (c.name) names.set(c.pos, c.name);
  const seen = new Set<string>();
  for (const n of names.values()) {
    const k = n.toLowerCase();
    if (seen.has(k)) return n;
    seen.add(k);
  }
  return null;
}

export async function requestRecast(
  userId: string,
  sheetId: unknown,
  body: unknown,
  deps: SchemaDeps,
): Promise<{ ok: true; jobId: string } | Fail> {
  if (typeof sheetId !== "string" || !ID.test(sheetId)) {
    return fail("NOT_FOUND", "Sheet tidak ditemukan.");
  }
  const sheet = await deps.repo.ownedActiveSheet(userId, sheetId);
  if (!sheet) return fail("NOT_FOUND", "Sheet tidak ditemukan.");
  if (sheet.versionStatus !== "READY" || !sheet.schema) {
    return fail("NOT_READY", "Data sheet ini masih diproses. Coba lagi setelah selesai.");
  }
  const parsed = parseRecastInput(body, sheet.colCount);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      "INVALID",
      `Perubahan tidak valid${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? "format salah"}.`,
    );
  }
  const input = parsed.data;
  if (input.baseRevision === undefined) {
    return fail("INVALID", "Perubahan tidak valid: revisi skema yang diedit wajib dikirim.");
  }
  if (input.baseRevision !== sheet.schemaRevision) {
    return fail(
      "STALE",
      "Skema sheet ini sudah diubah sejak halaman dibuka. Muat ulang halaman lalu ulangi perubahan.",
    );
  }
  const headerRow =
    input.headerRow !== undefined && input.headerRow !== sheet.headerRow
      ? input.headerRow
      : undefined;
  // Header baru → nama dan tipe dibentuk ulang dari baris itu; edit kolom lain diabaikan worker.
  const columns = headerRow === undefined ? changedColumns(sheet.schema, input.columns ?? []) : [];
  if (headerRow === undefined && columns.length === 0) {
    return fail("NO_CHANGE", "Tidak ada perubahan untuk disimpan.");
  }
  const dup = duplicateName(sheet.schema, columns);
  if (dup) return fail("INVALID", `Nama kolom "${dup}" dipakai lebih dari sekali.`);
  const rl = await deps.rateLimit(userId);
  if (!rl.allowed) {
    return {
      ...fail(
        "RATE_LIMITED",
        `Terlalu banyak koreksi skema. Coba lagi dalam ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} menit.`,
      ),
      retryAfterSec: rl.retryAfterSec,
    };
  }
  const jobId = await deps.enqueue(sheetId, {
    baseRevision: input.baseRevision,
    ...(headerRow !== undefined ? { headerRow } : { columns }),
  });
  return { ok: true, jobId };
}

export type RecastStatus =
  | { state: "queued" | "running" }
  | { state: "done"; revision: number }
  | { state: "stale" | "gone" | "unknown" }
  | { state: "invalid" | "failed"; message: string };

/** Status job recast milik sheet user (polling UI). Job lain/milik sheet lain → NOT_FOUND. */
export async function recastStatus(
  userId: string,
  sheetId: unknown,
  jobId: unknown,
  deps: SchemaDeps,
): Promise<{ ok: true; status: RecastStatus } | Fail> {
  if (typeof sheetId !== "string" || !ID.test(sheetId)) {
    return fail("NOT_FOUND", "Sheet tidak ditemukan.");
  }
  if (typeof jobId !== "string" || !JOB_ID.test(jobId)) {
    return fail("NOT_FOUND", "Koreksi tidak ditemukan.");
  }
  const sheet = await deps.repo.ownedActiveSheet(userId, sheetId);
  if (!sheet) return fail("NOT_FOUND", "Sheet tidak ditemukan.");
  const job = await deps.job(jobId);
  if (job && job.sheetId !== sheetId) return fail("NOT_FOUND", "Koreksi tidak ditemukan.");
  // Job sudah dibersihkan dari antrean (riwayat terbatas): UI memuat ulang skema dari DB.
  if (!job) return { ok: true, status: { state: "unknown" } };
  if (job.state === "waiting" || job.state === "delayed") {
    return { ok: true, status: { state: "queued" } };
  }
  if (job.state === "active") return { ok: true, status: { state: "running" } };
  if (job.state === "failed" || !job.result) {
    return {
      ok: true,
      status: {
        state: "failed",
        message: "Koreksi skema gagal diproses. Coba lagi; bila berulang, unggah ulang file.",
      },
    };
  }
  const r = job.result;
  switch (r.outcome) {
    case "done":
      return { ok: true, status: { state: "done", revision: r.revision } };
    case "stale":
      return { ok: true, status: { state: "stale" } };
    case "gone":
      return { ok: true, status: { state: "gone" } };
    case "invalid":
    case "failed":
      return { ok: true, status: { state: r.outcome, message: r.message } };
    default:
      // "busy" tidak pernah menjadi hasil akhir (worker menunda job); diperlakukan sebagai antre.
      return { ok: true, status: { state: "queued" } };
  }
}
