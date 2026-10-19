/*
 * Status ingest, review skema, dan koreksi (T-008, alur B3). Hanya pemilik dataset; sheet selalu
 * di-resolve lewat versi aktif dataset miliknya (sheet dataset lain → NOT_FOUND). Dependensi diinjeksi
 * (repo, mesin query, antrean, rate limit) agar bisa diuji tanpa layanan; perakitan produksi di
 * runtime.ts.
 *
 * Koreksi:
 *  - hanya nama tampil/sembunyikan → diterapkan langsung ke Sheet.schema (typed.parquet posisional,
 *    nama tidak tersimpan di sana), revisi naik tanpa worker (review T-008 M2);
 *  - tipe/format/baris judul → antrean recast (worker menulis typed-<rev+1> dari raw.parquet, tanpa
 *    membaca file asli). Satu job per sheet dan ≤ RECAST_INFLIGHT_PER_USER per user agar satu user
 *    tidak memonopoli worker (concurrency 1).
 * baseRevision wajib: edit dari tampilan lama ditolak (STALE) alih-alih menimpa edit yang lebih baru.
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import type { IngestProgress } from "@/features/ingest/ingest";
import type { SheetPreview } from "@/features/ingest/preview";
import {
  maxSchemaPos,
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
  /** `progress.refresh`: tahap "tipe" menerapkan skema aktif (versi refresh, T-013). */
  progress: IngestProgress | null;
  /** Sheet yang sudah tersimpan mentah (raw), urut indeks. */
  sheets: { index: number; name: string; rawRows: number; typed: boolean }[];
  errorMessage: string | null;
  /** Hanya saat UPLOADED dan terbaca dari antrean (route progres, T-024 AC 2). */
  queue?: { position: number; active: number } | null;
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
  /** Semua sheet versi aktif untuk tab (ringan: tanpa skema/pratinjau, review T-008 M1). */
  tabs: { id: string; index: number; name: string }[];
  /** Sheet yang dipilih (indeks diminta, atau sheet pertama), lengkap. */
  sheet: SheetView | null;
}

/** Job recast yang belum selesai (antre/diproses) per user dan per sheet. */
export const RECAST_INFLIGHT_PER_USER = 2;

export interface SchemaRepo {
  /** Versi terbaru dataset milik user yang sudah lewat tahap unggah, atau null (404/belum ada). */
  latestVersion(userId: string, datasetId: string): Promise<IngestStatus | null | "none">;
  schemaView(
    userId: string,
    datasetId: string,
    sheetIndex: number | null,
  ): Promise<SchemaView | null>;
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
  /** Cek kepemilikan ringan (polling status tiap 1,5 s tidak membaca skema, review T-008 L3). */
  ownsActiveSheet(userId: string, sheetId: string): Promise<boolean>;
  /**
   * Terapkan perubahan metadata (nama/sembunyikan) bila revisi masih baseRevision dan versi sheet
   * masih versi aktif READY. Revisi baru, atau null bila basi.
   */
  applyMetadata(
    sheetId: string,
    baseRevision: number,
    schema: ColumnSchema[],
  ): Promise<number | null>;
}

export interface RecastJobView {
  sheetId: string;
  state: "waiting" | "delayed" | "active" | "completed" | "failed" | "unknown";
  result: RecastOutcome | { outcome: "done"; revision: number } | null;
}

export type EditKind = "recast" | "metadata";

export interface SchemaDeps {
  repo: SchemaRepo;
  rateLimit(userId: string, kind: EditKind): Promise<{ allowed: boolean; retryAfterSec: number }>;
  /** Kembalikan slot rate limit bila enqueue gagal (review T-008 L5). */
  releaseRateLimit(userId: string, kind: EditKind): Promise<void>;
  /** Job recast belum selesai milik user, dan apakah sheet ini sudah punya satu. */
  inFlight(userId: string, sheetId: string): Promise<{ user: number; sheet: boolean }>;
  /**
   * Jalankan `fn` eksklusif per user (cek batas + enqueue atomik terhadap permintaan paralel user yang
   * sama). null = lock tidak didapat dalam waktu singkat.
   */
  serialize<T>(userId: string, fn: () => Promise<T>): Promise<T | null>;
  enqueue(sheetId: string, userId: string, input: RecastInput): Promise<string>;
  job(jobId: string): Promise<RecastJobView | null>;
}

export type SchemaCode =
  | "INVALID"
  | "NOT_FOUND"
  | "NOT_READY"
  | "NO_CHANGE"
  | "STALE"
  | "BUSY"
  | "QUEUE_FULL"
  | "RATE_LIMITED";

type Fail = { ok: false; code: SchemaCode; message: string; retryAfterSec?: number };
const fail = (code: SchemaCode, message: string): Fail => ({ ok: false, code, message });

const ID = /^[a-z0-9]{20,32}$/;
/** Id otomatis BullMQ (angka) atau id buatan app (rc_<hex>). */
const JOB_ID = /^(\d{1,20}|rc_[a-f0-9]{24})$/;

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
/** `_row` dan, bila ada, `_src_row` (urutan file: _row lebih dulu). */
const ROW_COLUMNS = "COLUMNS('^_(src_)?row$')";

export function sampleSql(columns: Pick<ColumnSchema, "pos" | "type">[]): string {
  const cols = columns.map((c) => {
    const id = `c${Math.trunc(c.pos)}`;
    return c.type === "text" ? `left(${id}, ${SAMPLE_TEXT_CHARS}) AS ${id}` : id;
  });
  // Tanpa ORDER BY: typed.parquet ditulis urut _row dan urutan sisip dipertahankan, jadi LIMIT membaca
  // row group pertama saja (top-N atas semua kolom kehabisan memori di tabel lebar). Nomor baris: typed
  // segmen (T-036) punya _src_row (baris fisik; _row = rowBase + baris fisik), typed lama hanya _row.
  return `SELECT ${[ROW_COLUMNS, ...cols].join(", ")} FROM read_parquet($path) LIMIT ${SAMPLE_ROWS}`;
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
  // Satu kolom nomor baris di depan: baris fisik (_src_row bila ada, selain itu _row typed lama).
  const lead = r.out.columns.indexOf("_src_row") === 1 ? 2 : 1;
  const types = ["integer" as const, ...shown.map((c) => c.type)];
  return {
    ok: true,
    columns: shown.map((c) => ({ pos: c.pos, name: c.name, type: c.type, hidden: c.hidden })),
    rows: r.out.rows.map((row) =>
      [row[lead - 1], ...row.slice(lead)].map((v, i) => toJson(v, types[i]!)),
    ),
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

const METADATA_FIELDS = new Set(["pos", "name", "hidden"]);
const isMetadataOnly = (columns: NonNullable<RecastInput["columns"]>) =>
  columns.every((c) => Object.keys(c).every((k) => METADATA_FIELDS.has(k)));

function applyMetadataChanges(
  schema: ColumnSchema[],
  changes: NonNullable<RecastInput["columns"]>,
): ColumnSchema[] {
  const byPos = new Map(changes.map((c) => [c.pos, c]));
  return schema.map((c) => {
    const ch = byPos.get(c.pos);
    if (!ch) return c;
    return {
      ...c,
      ...(ch.name !== undefined ? { name: ch.name } : {}),
      ...(ch.hidden !== undefined ? { hidden: ch.hidden } : {}),
    };
  });
}

function rateLimited(retryAfterSec: number): Fail {
  return {
    ...fail(
      "RATE_LIMITED",
      `Terlalu banyak koreksi skema. Coba lagi dalam ${Math.max(1, Math.ceil(retryAfterSec / 60))} menit.`,
    ),
    retryAfterSec,
  };
}

export type RecastRequestResult =
  { ok: true; jobId: string } | { ok: true; applied: true; revision: number } | Fail;

export async function requestRecast(
  userId: string,
  sheetId: unknown,
  body: unknown,
  deps: SchemaDeps,
): Promise<RecastRequestResult> {
  if (typeof sheetId !== "string" || !ID.test(sheetId)) {
    return fail("NOT_FOUND", "Sheet tidak ditemukan.");
  }
  const sheet = await deps.repo.ownedActiveSheet(userId, sheetId);
  if (!sheet) return fail("NOT_FOUND", "Sheet tidak ditemukan.");
  if (sheet.versionStatus !== "READY" || !sheet.schema) {
    return fail("NOT_READY", "Data sheet ini masih diproses. Coba lagi setelah selesai.");
  }
  // Kolom kosong (absent, T-014) berada setelah colCount dan tetap bisa diedit.
  const parsed = parseRecastInput(body, maxSchemaPos(sheet.colCount, sheet.schema));
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
  const stale = () =>
    fail(
      "STALE",
      "Skema sheet ini sudah diubah sejak halaman dibuka. Muat ulang halaman lalu ulangi perubahan.",
    );
  if (input.baseRevision !== sheet.schemaRevision) return stale();
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

  const busy = await deps.inFlight(userId, sheetId);
  if (busy.sheet) {
    return fail(
      "BUSY",
      "Koreksi sebelumnya untuk sheet ini masih diproses. Tunggu selesai, lalu muat ulang halaman.",
    );
  }

  if (headerRow === undefined && isMetadataOnly(columns)) {
    const rl = await deps.rateLimit(userId, "metadata");
    if (!rl.allowed) return rateLimited(rl.retryAfterSec);
    const revision = await deps.repo.applyMetadata(
      sheetId,
      input.baseRevision,
      applyMetadataChanges(sheet.schema, columns),
    );
    return revision === null ? stale() : { ok: true, applied: true, revision };
  }

  // Cek batas dan enqueue di bawah lock per user: permintaan paralel tidak bisa sama-sama melihat
  // "0 job berjalan" lalu semuanya masuk antrean.
  const serialized = await deps.serialize(userId, async (): Promise<RecastRequestResult> => {
    const now = await deps.inFlight(userId, sheetId);
    if (now.sheet) {
      return fail(
        "BUSY",
        "Koreksi sebelumnya untuk sheet ini masih diproses. Tunggu selesai, lalu muat ulang halaman.",
      );
    }
    if (now.user >= RECAST_INFLIGHT_PER_USER) {
      return fail(
        "QUEUE_FULL",
        `Masih ada ${now.user} koreksi Anda yang sedang diproses. Tunggu salah satunya selesai, lalu coba lagi.`,
      );
    }
    const rl = await deps.rateLimit(userId, "recast");
    if (!rl.allowed) return rateLimited(rl.retryAfterSec);
    try {
      const jobId = await deps.enqueue(sheetId, userId, {
        baseRevision: input.baseRevision!,
        ...(headerRow !== undefined ? { headerRow } : { columns }),
      });
      return { ok: true, jobId };
    } catch (e) {
      await deps.releaseRateLimit(userId, "recast").catch(() => {});
      throw e;
    }
  });
  return (
    serialized ??
    fail("QUEUE_FULL", "Permintaan koreksi Anda yang lain sedang dikirim. Coba lagi sebentar.")
  );
}

export type RecastStatus =
  | { state: "queued" | "running" }
  | { state: "done"; revision: number }
  | { state: "stale" | "gone" | "unknown" }
  | { state: "invalid" | "failed"; message: string };

/**
 * Status job recast milik sheet user (polling UI). Job yang tidak ada dan job milik sheet lain dijawab
 * sama ("unknown" → UI memuat ulang dari DB), jadi id job tidak bisa dipakai menebak aktivitas user
 * lain (review T-008 L1).
 */
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
  if (!(await deps.repo.ownsActiveSheet(userId, sheetId))) {
    return fail("NOT_FOUND", "Sheet tidak ditemukan.");
  }
  const job = await deps.job(jobId);
  // Job sudah dibersihkan dari antrean (riwayat terbatas), milik sheet lain, atau di luar daftar
  // BullMQ: UI memuat ulang skema dari DB (sumber kebenaran).
  if (!job || job.sheetId !== sheetId || job.state === "unknown") {
    return { ok: true, status: { state: "unknown" } };
  }
  if (job.state === "waiting" || job.state === "delayed") {
    return { ok: true, status: { state: "queued" } };
  }
  if (job.state === "active") return { ok: true, status: { state: "running" } };
  if (job.state === "completed" && !job.result) return { ok: true, status: { state: "unknown" } };
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
