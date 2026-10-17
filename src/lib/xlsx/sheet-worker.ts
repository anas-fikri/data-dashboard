/*
 * Entri worker thread pembaca satu sheet xlsx (T-de1b, lihat parallel.ts). Hanya XML worksheet yang
 * di-parse di sini; workbook/styles/sharedStrings datang dari thread utama (SharedBook). Baris
 * dikirim per batch dan parser menunggu di drain selama kredit habis.
 */
import { parentPort, workerData } from "node:worker_threads";
import {
  BATCH_CELLS,
  BATCH_CHARS,
  BATCH_ROWS,
  MAX_INFLIGHT,
  type FromWorker,
  type SheetRows,
  type ToWorker,
} from "./parallel";
import { parseSharedSheet, type SharedBook } from "./parser";

const port = parentPort!;
const { book, sheet } = workerData as { book: SharedBook; sheet: number };
let rows: SheetRows = [];
let cells = 0;
let chars = 0;
let fraction = 0;
let inflight = 0;
let wake: (() => void) | null = null;

const post = (m: FromWorker) => port.postMessage(m);
const send = () => {
  post({ k: "rows", rows, fraction });
  inflight++;
  rows = [];
  cells = 0;
  chars = 0;
};
port.on("message", (m: ToWorker) => {
  if (m.k !== "ack") return;
  inflight--;
  wake?.();
  wake = null;
});

parseSharedSheet(
  book,
  sheet,
  {
    onProgress: (p) => {
      fraction = p.fraction;
    },
    drain: async () => {
      if (rows.length >= BATCH_ROWS || cells >= BATCH_CELLS || chars >= BATCH_CHARS) send();
      while (inflight >= MAX_INFLIGHT) await new Promise<void>((r) => (wake = r));
    },
  },
  (_sheet, row, vals) => {
    rows.push([row, vals]);
    cells += vals.length;
    for (const v of vals) if (typeof v === "string") chars += v.length;
  },
).then(
  (truncated) => {
    if (rows.length) send();
    post({ k: "end", truncated });
  },
  (e: unknown) => {
    const err = (e ?? {}) as { name?: unknown; message?: unknown; code?: unknown };
    post({
      k: "error",
      name: typeof err.name === "string" ? err.name : "Error",
      message: typeof err.message === "string" ? err.message : String(e),
      code: typeof err.code === "string" ? err.code : undefined,
    });
  },
);
