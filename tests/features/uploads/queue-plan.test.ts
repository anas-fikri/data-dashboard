import { describe, expect, it } from "vitest";
import {
  VANISHED_MESSAGE,
  QUEUE_MAX_FILES,
  STOPPED_MESSAGE,
  decideAdvance,
  decideGroupAdvance,
  groupFilesProblem,
  orderQueueFiles,
  queueFilesProblem,
  queueSummaryText,
  queueView,
  type AdvanceItem,
  type AdvanceVersion,
  type QueueItemRow,
  type QueueItemState,
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

  it("hasil versi dicatat; gagal tidak menghentikan antrean; versi hilang tanpa catatan batal = gagal", () => {
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
        { id: "i3", state: "FAILED", message: VANISHED_MESSAGE },
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

describe("T-060: kelompok file satu periode", () => {
  const f = (name: string, label: string | null = null) => ({
    name,
    size: 10,
    lastModified: 1,
    label,
  });
  const ctx = { grain: "MONTH" as const, needsLabel: false, maxFiles: 3 };

  it("groupFilesProblem: 2..maxFiles file, tanpa duplikat, label satu periode", () => {
    expect(groupFilesProblem([f("a.csv")], ctx)).toBe("Pilih minimal 2 file untuk satu kelompok.");
    expect(groupFilesProblem([f("a"), f("b"), f("c"), f("d")], ctx)).toMatch(
      /^Satu kelompok paling banyak 3 file, Anda memilih 4 file/,
    );
    expect(groupFilesProblem([f("a"), f("a")], ctx)).toMatch(/terpilih dua kali/);
    expect(groupFilesProblem([f("a"), f("b"), f("c")], ctx)).toBeNull();
    const lab = { ...ctx, needsLabel: true };
    expect(groupFilesProblem([f("a", "2026-03-01"), f("b")], lab)).toBe(
      "Pilih periode kelompok ini.",
    );
    expect(groupFilesProblem([f("a", "2026-03-01"), f("b", "2026-04-01")], lab)).toMatch(
      /periode yang sama/,
    );
    // Satu periode dua file: kelompok boleh (antrean biasa menolaknya).
    expect(groupFilesProblem([f("a", "2026-03-01"), f("b", "2026-03-01")], lab)).toBeNull();
    expect(
      queueFilesProblem([f("a", "2026-03-01"), f("b", "2026-03-01")], {
        grain: "MONTH",
        needsLabel: true,
      }),
    ).toMatch(/sama-sama untuk Maret 2026/);
  });

  const it3 = (states: QueueItemState[]) =>
    states.map((state, i) => ({
      id: `i${i + 1}`,
      seq: i + 1,
      state,
      versionId: "g",
      name: `f${i + 1}`,
    }));

  it("decideGroupAdvance: tunggu semua terunggah, promosi sekali, hasil versi ke semua file", () => {
    expect(
      decideGroupAdvance(it3(["QUEUED", "UPLOADING", "QUEUED"]), undefined, false).next,
    ).toEqual({
      kind: "wait",
      id: "i2",
      reason: "upload",
    });
    expect(decideGroupAdvance(it3(["QUEUED", "QUEUED", "QUEUED"]), undefined, true).next).toEqual({
      kind: "wait",
      id: "i1",
      reason: "busy",
    });
    expect(decideGroupAdvance(it3(["QUEUED", "QUEUED", "QUEUED"]), undefined, false).next).toEqual({
      kind: "promote",
      id: "i1",
    });
    const started = it3(["STARTED", "STARTED", "STARTED"]);
    const v = (status: string) => ({
      status,
      errorMessage: "rusak",
      summary: "Maret 2026 diganti",
    });
    expect(decideGroupAdvance(started, v("UPLOADED"), false).next).toEqual({
      kind: "reenqueue",
      id: "i1",
      versionId: "g",
    });
    expect(decideGroupAdvance(started, v("AWAITING_CONFIRM"), false).next).toMatchObject({
      kind: "wait",
      reason: "held",
    });
    expect(decideGroupAdvance(started, v("READY"), false)).toEqual({
      settle: ["i1", "i2", "i3"].map((id) => ({
        id,
        state: "DONE",
        message: "Maret 2026 diganti",
      })),
      next: { kind: "finished" },
    });
    expect(decideGroupAdvance(started, v("FAILED"), false).settle.map((s) => s.state)).toEqual([
      "FAILED",
      "FAILED",
      "FAILED",
    ]);
    expect(decideGroupAdvance(started, null, false).settle[0]).toMatchObject({ state: "FAILED" });
  });

  it("decideGroupAdvance: satu file gagal/dilewati atau dihentikan → semua dibatalkan", () => {
    const d = decideGroupAdvance(it3(["QUEUED", "FAILED", "WAITING"]), undefined, false);
    expect(d.settle.map((s) => [s.id, s.state])).toEqual([
      ["i1", "CANCELLED"],
      ["i3", "CANCELLED"],
    ]);
    expect(d.settle[0]!.message).toMatch(/“f2” gagal atau dilewati/);
    expect(d.next).toEqual({ kind: "finished" });
    const stop = decideGroupAdvance(it3(["QUEUED", "QUEUED", "UPLOADING"]), undefined, false, true);
    expect(stop.settle.map((s) => s.state)).toEqual(["CANCELLED", "CANCELLED", "CANCELLED"]);
  });

  it("ringkasan kelompok", () => {
    const counts = { done: 3, failed: 0, cancelled: 0, remaining: 0 };
    expect(queueSummaryText({ status: "DONE", total: 3, counts, grouped: true })).toBe(
      "Kelompok selesai: 3 file — diterapkan sebagai satu periode.",
    );
    expect(
      queueSummaryText({
        status: "DONE",
        total: 3,
        counts: { done: 0, failed: 3, cancelled: 0, remaining: 0 },
        grouped: true,
      }),
    ).toBe("Kelompok selesai: 3 file — gagal, data aktif tidak berubah.");
  });
});
