import { describe, expect, it } from "vitest";
import {
  DISCARDED_MESSAGE,
  QUEUE_MAX_FILES,
  STOPPED_MESSAGE,
  decideAdvance,
  orderQueueFiles,
  queueFilesProblem,
  queueSummaryText,
  queueView,
  type AdvanceItem,
  type AdvanceVersion,
  type QueueItemRow,
} from "@/features/uploads/queue-plan";

/*
 * T-059 antrean unggah (murni): urutan proses deterministik, validasi daftar file, keputusan giliran
 * (urutan ketat, gagal tidak menghentikan, tinjauan menahan, hentikan), dan tampilan "File k dari n".
 */
const f = (name: string, label: string | null = null, size = 10, lastModified = 1) => ({
  name,
  size,
  lastModified,
  label,
});

describe("orderQueueFiles", () => {
  it("periode dari nama file naik, file tanpa periode terakhir (urut nama, angka sebagai angka)", () => {
    const files = [
      f("rusak.xlsx"),
      f("april 2026.csv"),
      f("file 10.csv"),
      f("februari 2026.csv"),
      f("file 2.csv"),
      f("2026-03.csv"),
    ];
    expect(orderQueueFiles(files, "MONTH").map((x) => x.name)).toEqual([
      "februari 2026.csv",
      "2026-03.csv",
      "april 2026.csv",
      "file 2.csv",
      "file 10.csv",
      "rusak.xlsx",
    ]);
  });

  it("label pilihan pemilik mengalahkan nama file; hasil sama untuk urutan pilihan apa pun", () => {
    const files = [
      f("maret.csv", "2026-01-01"),
      f("x.csv", "2025-12-01"),
      f("b.csv", "2026-02-01"),
    ];
    const a = orderQueueFiles(files, "MONTH").map((x) => x.name);
    const b = orderQueueFiles([...files].reverse(), "MONTH").map((x) => x.name);
    expect(a).toEqual(["x.csv", "maret.csv", "b.csv"]);
    expect(b).toEqual(a);
  });

  it("seri diputus nama persis, ukuran, lalu lastModified", () => {
    const files = [
      f("data.csv", null, 20, 1),
      f("Data.csv", null, 10, 1),
      f("data.csv", null, 10, 2),
    ];
    const out = orderQueueFiles(files, "MONTH");
    expect(orderQueueFiles([...files].reverse(), "MONTH")).toEqual(out);
    expect(out.map((x) => `${x.name}:${x.size}:${x.lastModified}`)).toEqual([
      "Data.csv:10:1",
      "data.csv:10:2",
      "data.csv:20:1",
    ]);
  });
});

describe("queueFilesProblem", () => {
  const col = { grain: "MONTH" as const, needsLabel: false };
  const lab = { grain: "MONTH" as const, needsLabel: true };
  it("minimal 2, maksimal QUEUE_MAX_FILES", () => {
    expect(queueFilesProblem([f("a.csv")], col)).toMatch(/minimal 2/);
    const many = Array.from({ length: QUEUE_MAX_FILES + 1 }, (_, i) => f(`f${i}.csv`));
    expect(queueFilesProblem(many, col)).toMatch(`Maksimal ${QUEUE_MAX_FILES} file`);
    expect(queueFilesProblem(many.slice(0, QUEUE_MAX_FILES), col)).toBeNull();
  });
  it("file yang sama dipilih dua kali ditolak", () => {
    expect(queueFilesProblem([f("a.csv"), f("a.csv")], col)).toBe(
      "File “a.csv” terpilih dua kali. Hapus salah satunya.",
    );
    expect(queueFilesProblem([f("a.csv"), f("a.csv", null, 11)], col)).toBeNull();
  });
  it("sheet berlabel: setiap file wajib berperiode, satu file per periode", () => {
    expect(queueFilesProblem([f("a.csv", "2026-01-01"), f("b.csv")], lab)).toBe(
      "Pilih periode untuk “b.csv”.",
    );
    expect(queueFilesProblem([f("a.csv"), f("b.csv")], lab)).toBe(
      "Pilih periode untuk 2 file yang belum berperiode.",
    );
    expect(queueFilesProblem([f("a.csv", "2026-01-01"), f("b.csv", "2026-01-01")], lab)).toBe(
      "“a.csv” dan “b.csv” sama-sama untuk Januari 2026. Satu periode diganti utuh oleh satu file — pilih satu file per periode.",
    );
    expect(queueFilesProblem([f("a.csv", "2026-01-01"), f("b.csv", "2026-02-01")], lab)).toBeNull();
  });
});

const it_ = (seq: number, state: AdvanceItem["state"]): AdvanceItem => ({
  id: `i${seq}`,
  seq,
  state,
  versionId: `v${seq}`,
});
const ver = (status: string, extra: Partial<AdvanceVersion> = {}): AdvanceVersion => ({
  status,
  errorMessage: null,
  summary: null,
  ...extra,
});

describe("decideAdvance", () => {
  it("file utuh pertama dipromosikan bila dataset bebas; sibuk → menunggu", () => {
    const items = [it_(1, "QUEUED"), it_(2, "QUEUED")];
    expect(decideAdvance(items, new Map(), false)).toEqual({
      settle: [],
      next: { kind: "promote", id: "i1" },
    });
    expect(decideAdvance(items, new Map(), true).next).toEqual({
      kind: "wait",
      id: "i1",
      reason: "busy",
    });
  });

  it("urutan ketat: file 2 yang sudah utuh tidak mendahului file 1 yang belum terunggah", () => {
    const items = [it_(2, "QUEUED"), it_(1, "UPLOADING")];
    expect(decideAdvance(items, new Map(), false).next).toEqual({
      kind: "wait",
      id: "i1",
      reason: "upload",
    });
  });

  it("hasil versi dicatat; gagal tidak menghentikan antrean; versi dibuang = dibatalkan", () => {
    const items = [
      it_(1, "STARTED"),
      it_(2, "STARTED"),
      it_(3, "STARTED"),
      it_(4, "FAILED"),
      it_(5, "QUEUED"),
    ];
    const versions = new Map<string, AdvanceVersion | null>([
      ["v1", ver("READY", { summary: "Maret 2026 ditambahkan (2 baris)" })],
      ["v2", ver("FAILED", { errorMessage: "Kolom tidak cocok." })],
    ]);
    expect(decideAdvance(items, versions, false)).toEqual({
      settle: [
        { id: "i1", state: "DONE", message: "Maret 2026 ditambahkan (2 baris)" },
        { id: "i2", state: "FAILED", message: "Kolom tidak cocok." },
        { id: "i3", state: "CANCELLED", message: DISCARDED_MESSAGE },
      ],
      next: { kind: "promote", id: "i5" },
    });
  });

  it("tinjauan/pemetaan menahan antrean; diproses = menunggu; UPLOADED = antre ulang job", () => {
    const items = [it_(1, "STARTED"), it_(2, "QUEUED")];
    const at = (status: string) => decideAdvance(items, new Map([["v1", ver(status)]]), false).next;
    expect(at("AWAITING_CONFIRM")).toEqual({ kind: "wait", id: "i1", reason: "held" });
    expect(at("AWAITING_MAPPING")).toEqual({ kind: "wait", id: "i1", reason: "held" });
    expect(at("INGESTING")).toEqual({ kind: "wait", id: "i1", reason: "processing" });
    expect(at("UPLOADED")).toEqual({ kind: "reenqueue", id: "i1", versionId: "v1" });
  });

  it("semua selesai → finished", () => {
    expect(decideAdvance([it_(1, "DONE"), it_(2, "CANCELLED")], new Map(), false)).toEqual({
      settle: [],
      next: { kind: "finished" },
    });
  });

  it("dihentikan: file yang belum menjadi versi dibatalkan, file yang ditinjau tetap ditunggu", () => {
    const items = [it_(1, "STARTED"), it_(2, "QUEUED"), it_(3, "WAITING"), it_(4, "UPLOADING")];
    const d = decideAdvance(items, new Map([["v1", ver("AWAITING_CONFIRM")]]), false, true);
    expect(d.settle).toEqual([
      { id: "i2", state: "CANCELLED", message: STOPPED_MESSAGE },
      { id: "i3", state: "CANCELLED", message: STOPPED_MESSAGE },
      { id: "i4", state: "CANCELLED", message: STOPPED_MESSAGE },
    ]);
    expect(d.next).toEqual({ kind: "wait", id: "i1", reason: "held" });
    // Setelah keputusan: selesai.
    const after = decideAdvance(
      [it_(1, "STARTED"), it_(2, "CANCELLED")],
      new Map([["v1", ver("READY")]]),
      false,
      true,
    );
    expect(after).toEqual({
      settle: [{ id: "i1", state: "DONE", message: null }],
      next: { kind: "finished" },
    });
  });
});

const row = (seq: number, over: Partial<QueueItemRow> = {}): QueueItemRow => ({
  id: `i${seq}`,
  seq,
  name: `f${seq}.csv`,
  size: 10,
  lastModified: 1,
  label: null,
  state: "WAITING",
  message: null,
  versionId: `v${seq}`,
  versionStatus: null,
  ...over,
});

describe("queueView", () => {
  const q = { id: "q", status: "OPEN" as const, grain: "MONTH" as const, stopped: false };
  it("posisi = file pertama yang belum selesai; tahan saat menunggu tinjauan", () => {
    const v = queueView(q, [
      row(3, { state: "QUEUED" }),
      row(1, { state: "DONE" }),
      row(2, { state: "STARTED", versionStatus: "AWAITING_CONFIRM" }),
    ]);
    expect(v.position).toBe(2);
    expect(v.held).toEqual({ kind: "confirm", versionId: "v2", name: "f2.csv" });
    expect(v.counts).toEqual({ done: 1, failed: 0, cancelled: 0, remaining: 2 });
    expect(v.items.map((i) => [i.seq, i.statusText])).toEqual([
      [1, "Selesai"],
      [2, "Menunggu tinjauan Anda"],
      [3, "Terunggah, menunggu giliran"],
    ]);
  });

  it("pemetaan menahan; diproses tidak menahan; antrean selesai tanpa posisi", () => {
    expect(
      queueView(q, [row(1, { state: "STARTED", versionStatus: "AWAITING_MAPPING" })]).held?.kind,
    ).toBe("mapping");
    expect(
      queueView(q, [row(1, { state: "STARTED", versionStatus: "INGESTING" })]).held,
    ).toBeNull();
    const done = queueView({ ...q, status: "DONE" }, [row(1, { state: "DONE" })]);
    expect(done.position).toBeNull();
  });

  it("ringkasan menyebut berhasil/gagal/dibatalkan", () => {
    const v = queueView({ ...q, status: "DONE" }, [
      row(1, { state: "DONE" }),
      row(2, { state: "FAILED" }),
      row(3, { state: "DONE" }),
    ]);
    expect(queueSummaryText(v)).toBe("Antrean selesai: 3 file — 2 berhasil, 1 gagal.");
    const s = queueView({ ...q, status: "CANCELLED", stopped: true }, [
      row(1, { state: "CANCELLED" }),
      row(2, { state: "CANCELLED" }),
    ]);
    expect(queueSummaryText(s)).toBe("Antrean dihentikan: 2 file — 0 berhasil, 2 dibatalkan.");
  });
});
