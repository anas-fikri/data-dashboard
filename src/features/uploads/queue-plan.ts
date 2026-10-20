/*
 * Antrean unggah banyak file periode (T-059, rencana G-6 §4.5 langkah 6) — bagian murni: urutan proses
 * yang deterministik, validasi daftar file, keputusan langkah berikutnya, dan tampilan status per file.
 * Dipakai server (queue.ts) dan komponen klien; diuji unit.
 *
 * Aturan: hanya satu versi non-terminal per dataset (D4), jadi file diproses satu per satu menurut `seq`.
 * File yang gagal tidak menghentikan antrean; file yang menunggu tinjauan/pemetaan menahannya sampai
 * pemilik memutuskan; file berikutnya tidak pernah mendahului file sebelumnya (urutan ketat).
 */
import { periodLabel, type PeriodGrain } from "@/features/ingest/period";
import { guessPeriodFromName } from "./period-label";

/** Batas file per antrean (mengisi riwayat 12–24 bulan, dengan ruang untuk kuartal/koreksi). */
export const QUEUE_MAX_FILES = 36;
export const QUEUE_MIN_FILES = 2;

export type QueueItemState =
  "WAITING" | "UPLOADING" | "QUEUED" | "STARTED" | "DONE" | "FAILED" | "CANCELLED";
export type QueueStatus = "OPEN" | "DONE" | "CANCELLED";

export const TERMINAL_ITEM_STATES: ReadonlySet<QueueItemState> = new Set([
  "DONE",
  "FAILED",
  "CANCELLED",
]);
/** File yang belum menjadi versi: masih bisa dilewati/dibatalkan pemilik. */
export const UNSTARTED_ITEM_STATES = ["WAITING", "UPLOADING", "QUEUED"] as const;

export interface QueueFile {
  name: string;
  size: number;
  lastModified: number;
  /** Awal periode (YYYY-MM-DD) untuk sheet bersumber label; null = dari kolom tanggal. */
  label: string | null;
}

/** Kolasi nama file "manusiawi": angka dibandingkan sebagai angka (file 2 sebelum file 10). */
const collator = new Intl.Collator("id-ID", { numeric: true, sensitivity: "base" });

/** Kunci urut periode: label pilihan pemilik, atau periode yang jelas dari nama file, atau null. */
export function periodKeyOfFile(f: Pick<QueueFile, "name" | "label">, grain: PeriodGrain) {
  return f.label ?? guessPeriodFromName(f.name, grain);
}

/**
 * Urutan proses deterministik: periode (label/nama file) naik — bulan lama dulu, sehingga batas
 * "simpan N periode terbaru" melepas yang paling tua — lalu file tanpa periode jelas menurut nama
 * (angka sebagai angka). Seri diputus nama persis, ukuran, lalu lastModified: hasil sama untuk himpunan
 * file yang sama, apa pun urutan pilihannya.
 */
export function orderQueueFiles<T extends QueueFile>(files: readonly T[], grain: PeriodGrain): T[] {
  const keyed = files.map((f) => ({ f, key: periodKeyOfFile(f, grain) }));
  keyed.sort((a, b) => {
    if (a.key !== b.key) {
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      return a.key < b.key ? -1 : 1;
    }
    const byName = collator.compare(a.f.name, b.f.name);
    if (byName !== 0) return byName;
    if (a.f.name !== b.f.name) return a.f.name < b.f.name ? -1 : 1;
    if (a.f.size !== b.f.size) return a.f.size - b.f.size;
    return a.f.lastModified - b.f.lastModified;
  });
  return keyed.map((k) => k.f);
}

/** Identitas file di klien (sama dengan sidik resume unggahan: nama + ukuran + lastModified). */
export const fileIdentity = (f: Pick<QueueFile, "name" | "size" | "lastModified">) =>
  `${f.name}\n${f.size}\n${f.lastModified}`;

/**
 * Pemeriksaan daftar file sebelum antrean dibuat (murni; server memeriksa ulang). null = boleh.
 * Satu periode berlabel hanya boleh satu file: file kedua akan mengganti utuh file pertama (kelompok
 * beberapa file per periode adalah T-060), jadi ini hampir pasti salah pilih.
 */
export function queueFilesProblem(
  files: readonly QueueFile[],
  ctx: { grain: PeriodGrain; needsLabel: boolean },
): string | null {
  if (files.length < QUEUE_MIN_FILES) return "Pilih minimal 2 file untuk antrean.";
  if (files.length > QUEUE_MAX_FILES) {
    return `Maksimal ${QUEUE_MAX_FILES} file per antrean. Unggah sisanya setelah antrean ini selesai.`;
  }
  const seen = new Set<string>();
  for (const f of files) {
    const id = fileIdentity(f);
    if (seen.has(id)) return `File “${f.name}” terpilih dua kali. Hapus salah satunya.`;
    seen.add(id);
  }
  if (!ctx.needsLabel) return null;
  const missing = files.filter((f) => !f.label);
  if (missing.length) {
    return missing.length === 1
      ? `Pilih periode untuk “${missing[0]!.name}”.`
      : `Pilih periode untuk ${missing.length} file yang belum berperiode.`;
  }
  const byLabel = new Map<string, string>();
  for (const f of files) {
    const other = byLabel.get(f.label!);
    if (other !== undefined) {
      return `“${other}” dan “${f.name}” sama-sama untuk ${periodLabel(ctx.grain, f.label!)}. Satu periode diganti utuh oleh satu file — pilih satu file per periode.`;
    }
    byLabel.set(f.label!, f.name);
  }
  return null;
}

// ── Keputusan langkah berikutnya ─────────────────────────────────────────────────────────────────

export interface AdvanceItem {
  id: string;
  seq: number;
  state: QueueItemState;
  versionId: string;
}

/** Versi milik file STARTED (null = sudah tidak ada: dibuang di tinjauan/pemetaan atau kedaluwarsa). */
export interface AdvanceVersion {
  status: string;
  errorMessage: string | null;
  /** Ringkasan rencana periode (versi READY), untuk keterangan di ringkasan antrean. */
  summary: string | null;
}

export type AdvanceSettle = {
  id: string;
  state: "DONE" | "FAILED" | "CANCELLED";
  message: string | null;
};

export type AdvanceNext =
  /** File ini dibuatkan versinya dan diantrekan ke worker. */
  | { kind: "promote"; id: string }
  /** Versi file ini masih UPLOADED: pastikan job ingest ada (idempoten, jobId = versionId). */
  | { kind: "reenqueue"; id: string; versionId: string }
  /**
   * Menunggu: versi file sedang diproses / menunggu keputusan pemilik ("held"), file belum utuh
   * terunggah ("upload"), atau dataset sedang memproses versi lain ("busy").
   */
  | { kind: "wait"; id: string; reason: "processing" | "held" | "upload" | "busy" }
  | { kind: "finished" };

export interface AdvanceDecision {
  settle: AdvanceSettle[];
  next: AdvanceNext;
}

export const STOPPED_MESSAGE = "Antrean dihentikan sebelum file ini diproses.";

export const DISCARDED_MESSAGE =
  "Dibatalkan di layar tinjauan/pemetaan (atau kedaluwarsa); data aktif tidak berubah.";

const HELD = new Set(["AWAITING_CONFIRM", "AWAITING_MAPPING"]);

/**
 * Langkah berikutnya antrean (murni). `busy` = dataset punya versi non-terminal yang BUKAN milik file
 * antrean yang sedang berjalan. File diperiksa menurut `seq`; hasil versi yang sudah terminal dicatat
 * di file (`settle`) karena versinya bisa dibuang retensi kemudian. `stopped` ("Hentikan antrean"):
 * file yang belum menjadi versi dibatalkan, file yang sedang diproses tetap ditunggu sampai selesai.
 */
export function decideAdvance(
  items: readonly AdvanceItem[],
  versions: ReadonlyMap<string, AdvanceVersion | null>,
  busy: boolean,
  stopped = false,
): AdvanceDecision {
  const settle: AdvanceSettle[] = [];
  const ordered = [...items].sort((a, b) => a.seq - b.seq);
  let wait: AdvanceNext | null = null;
  for (const it of ordered) {
    if (TERMINAL_ITEM_STATES.has(it.state)) continue;
    if (stopped && it.state !== "STARTED") {
      settle.push({ id: it.id, state: "CANCELLED", message: STOPPED_MESSAGE });
      continue;
    }
    if (wait) continue;
    if (it.state === "STARTED") {
      const v = versions.get(it.versionId) ?? null;
      if (!v) {
        settle.push({ id: it.id, state: "CANCELLED", message: DISCARDED_MESSAGE });
        continue;
      }
      if (v.status === "READY") {
        settle.push({ id: it.id, state: "DONE", message: v.summary });
        continue;
      }
      if (v.status === "FAILED") {
        settle.push({ id: it.id, state: "FAILED", message: v.errorMessage ?? "Gagal diproses." });
        continue;
      }
      wait =
        v.status === "UPLOADED"
          ? { kind: "reenqueue", id: it.id, versionId: it.versionId }
          : { kind: "wait", id: it.id, reason: HELD.has(v.status) ? "held" : "processing" };
      if (!stopped) break;
      continue;
    }
    if (it.state === "QUEUED") {
      return {
        settle,
        next: busy ? { kind: "wait", id: it.id, reason: "busy" } : { kind: "promote", id: it.id },
      };
    }
    // WAITING/UPLOADING: urutan ketat — file berikutnya tidak mendahului file yang belum terunggah.
    return { settle, next: { kind: "wait", id: it.id, reason: "upload" } };
  }
  return { settle, next: wait ?? { kind: "finished" } };
}

// ── Tampilan ─────────────────────────────────────────────────────────────────────────────────────

export type QueueTone = "muted" | "progress" | "warning" | "success" | "error";

export interface QueueItemRow {
  id: string;
  seq: number;
  name: string;
  size: number;
  lastModified: number;
  label: string | null;
  state: QueueItemState;
  message: string | null;
  versionId: string;
  /** Status versi file STARTED (null selain itu / versi sudah tidak ada). */
  versionStatus: string | null;
}

export interface QueueItemView extends QueueItemRow {
  statusText: string;
  tone: QueueTone;
}

export interface QueueView {
  id: string;
  status: QueueStatus;
  grain: PeriodGrain | null;
  /** "Hentikan antrean" sudah ditekan (file yang sedang diproses masih diselesaikan). */
  stopped: boolean;
  total: number;
  /** Nomor file yang sedang diproses/ditunggu ("File 3 dari 12"); null = tidak ada (selesai). */
  position: number | null;
  /** File yang menahan antrean menunggu keputusan pemilik. */
  held: { kind: "confirm" | "mapping"; versionId: string; name: string } | null;
  counts: { done: number; failed: number; cancelled: number; remaining: number };
  items: QueueItemView[];
}

function statusOf(r: QueueItemRow): { statusText: string; tone: QueueTone } {
  switch (r.state) {
    case "WAITING":
      return { statusText: "Belum diunggah", tone: "muted" };
    case "UPLOADING":
      return { statusText: "Belum selesai diunggah", tone: "muted" };
    case "QUEUED":
      return { statusText: "Terunggah, menunggu giliran", tone: "muted" };
    case "STARTED":
      switch (r.versionStatus) {
        case "AWAITING_CONFIRM":
          return { statusText: "Menunggu tinjauan Anda", tone: "warning" };
        case "AWAITING_MAPPING":
          return { statusText: "Menunggu pemetaan kolom", tone: "warning" };
        case "UPLOADED":
          return { statusText: "Menunggu giliran diproses", tone: "progress" };
        default:
          return { statusText: "Sedang diproses", tone: "progress" };
      }
    case "DONE":
      return { statusText: "Selesai", tone: "success" };
    case "FAILED":
      return { statusText: "Gagal", tone: "error" };
    case "CANCELLED":
      return { statusText: "Dibatalkan", tone: "muted" };
  }
}

/** Tampilan antrean dari baris file (murni). */
export function queueView(
  q: { id: string; status: QueueStatus; grain: PeriodGrain | null; stopped: boolean },
  rows: readonly QueueItemRow[],
): QueueView {
  const items = [...rows].sort((a, b) => a.seq - b.seq).map((r) => ({ ...r, ...statusOf(r) }));
  const counts = { done: 0, failed: 0, cancelled: 0, remaining: 0 };
  for (const it of items) {
    if (it.state === "DONE") counts.done++;
    else if (it.state === "FAILED") counts.failed++;
    else if (it.state === "CANCELLED") counts.cancelled++;
    else counts.remaining++;
  }
  const current =
    q.status === "OPEN" ? items.find((it) => !TERMINAL_ITEM_STATES.has(it.state)) : undefined;
  const held =
    current?.state === "STARTED" &&
    (current.versionStatus === "AWAITING_CONFIRM" || current.versionStatus === "AWAITING_MAPPING")
      ? {
          kind:
            current.versionStatus === "AWAITING_CONFIRM"
              ? ("confirm" as const)
              : ("mapping" as const),
          versionId: current.versionId,
          name: current.name,
        }
      : null;
  return {
    id: q.id,
    status: q.status,
    grain: q.grain,
    stopped: q.stopped,
    total: items.length,
    position: current ? current.seq : null,
    held,
    counts,
    items,
  };
}

/** Kalimat ringkasan antrean yang selesai/dihentikan. */
export function queueSummaryText(v: Pick<QueueView, "status" | "total" | "counts">): string {
  const fmt = (n: number) => n.toLocaleString("id-ID");
  const parts = [`${fmt(v.counts.done)} berhasil`];
  if (v.counts.failed) parts.push(`${fmt(v.counts.failed)} gagal`);
  if (v.counts.cancelled) parts.push(`${fmt(v.counts.cancelled)} dibatalkan`);
  const head = v.status === "CANCELLED" ? "Antrean dihentikan" : "Antrean selesai";
  return `${head}: ${fmt(v.total)} file — ${parts.join(", ")}.`;
}
