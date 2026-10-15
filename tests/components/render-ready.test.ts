import { describe, expect, it, vi } from "vitest";
import { createReadyTracker, type ReadyDeps } from "@/components/render/render-ready";

/*
 * T-018 D7: sinyal siap cetak. Tanda dipasang sekali, hanya setelah semua bagian async selesai (galat
 * dihitung selesai), font siap, DOM tenang, dan 2 frame; bagian yang mendaftar/selesai selama urutan
 * berjalan mengulang urutannya; dihentikan (lepas) → tidak pernah dipasang.
 */
function harness() {
  const quiet: (() => void)[] = [];
  const deps: ReadyDeps & { marks: number } = {
    marks: 0,
    fontsReady: vi.fn(() => Promise.resolve()),
    // Diselesaikan manual: tes menentukan kapan DOM "tenang".
    quiet: vi.fn(() => new Promise<void>((resolve) => quiet.push(resolve))),
    frame: (cb) => queueMicrotask(cb),
    mark: () => {
      deps.marks++;
    },
  };
  const flush = async () => {
    for (let k = 0; k < 10; k++) await Promise.resolve();
  };
  /** Selesaikan jendela tenang yang sedang menunggu, lalu biarkan urutan berjalan. */
  const settleQuiet = async () => {
    await flush();
    quiet.splice(0).forEach((r) => r());
    await flush();
  };
  return { deps, tracker: createReadyTracker(deps), settleQuiet, flush };
}

describe("createReadyTracker", () => {
  it("tanpa bagian async: font → DOM tenang → 2 frame → tanda sekali", async () => {
    const { deps, tracker, settleQuiet } = harness();
    tracker.start();
    expect(deps.marks).toBe(0);
    await settleQuiet();
    expect(deps.fontsReady).toHaveBeenCalledTimes(1);
    expect(deps.marks).toBe(1);
    // Selesai tidak memasang ulang.
    tracker.register()();
    await settleQuiet();
    expect(deps.marks).toBe(1);
  });

  it("menunggu semua grafik terdaftar; galat (settle) dihitung selesai", async () => {
    const { deps, tracker, settleQuiet } = harness();
    const chartA = tracker.register();
    const chartB = tracker.register();
    tracker.start();
    await settleQuiet();
    expect(deps.quiet).not.toHaveBeenCalled();
    chartA();
    chartA(); // idempoten: tidak menghitung dua kali
    await settleQuiet();
    expect(deps.marks).toBe(0);
    chartB(); // gagal dimuat → tetap selesai
    await settleQuiet();
    expect(deps.marks).toBe(1);
  });

  it("belum dimulai (provider belum terpasang): tidak ada tanda walau semua selesai", async () => {
    const { deps, tracker, settleQuiet } = harness();
    tracker.register()();
    await settleQuiet();
    expect(deps.marks).toBe(0);
  });

  it("bagian baru mendaftar selama urutan berjalan → tunggu bagian itu lalu ulangi urutan", async () => {
    const { deps, tracker, settleQuiet, flush } = harness();
    tracker.start();
    await flush(); // urutan sedang menunggu DOM tenang
    const late = tracker.register(); // kartu beralih ke grafik
    await settleQuiet();
    expect(deps.marks).toBe(0);
    late();
    await settleQuiet();
    expect(deps.marks).toBe(1);
    expect(vi.mocked(deps.quiet).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("bagian yang mendaftar DAN selesai selama urutan berjalan → urutan diulang sebelum tanda", async () => {
    const { deps, tracker, settleQuiet, flush } = harness();
    tracker.start();
    await flush();
    tracker.register()();
    await settleQuiet(); // putaran pertama melihat perubahan → putaran kedua
    expect(deps.marks).toBe(0);
    await settleQuiet();
    expect(deps.marks).toBe(1);
  });

  it("font gagal dimuat tidak menahan tanda", async () => {
    const { deps, tracker, settleQuiet } = harness();
    deps.fontsReady = vi.fn(() => Promise.reject(new Error("font")));
    tracker.start();
    await settleQuiet();
    expect(deps.marks).toBe(1);
  });

  it("dihentikan (lepas) sebelum selesai → tanpa tanda; dimulai lagi (StrictMode) → tanda", async () => {
    const { deps, tracker, settleQuiet, flush } = harness();
    const stop = tracker.start();
    await flush();
    stop();
    await settleQuiet();
    expect(deps.marks).toBe(0);
    tracker.start();
    await settleQuiet();
    expect(deps.marks).toBe(1);
  });
});
