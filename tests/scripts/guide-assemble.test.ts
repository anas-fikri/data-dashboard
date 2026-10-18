import { describe, expect, it } from "vitest";
import { toVtt } from "../../scripts/guide-assemble.mjs";
import { isVtt } from "@/features/guides/media";

/* T-3k08: takarir VTT dari linimasa narasi — mengikuti ucapan, per kalimat, maks. 2 baris ± 42 karakter. */
describe("toVtt", () => {
  const timeline = [
    {
      t: 1200,
      dur: 6,
      file: null,
      text: "Dataset adalah tempat menyimpan data Anda. Kita mulai dengan menekan tombol Buat dataset.",
    },
    { t: 9000, dur: 2, file: null, text: "Selesai." },
  ];

  it("lolos validasi WebVTT aplikasi; cue dimulai di detik kalimat dan berakhir tepat di ujung durasi", () => {
    const vtt = toVtt(timeline);
    expect(isVtt(new TextEncoder().encode(vtt))).toBe(true);
    const times = [...vtt.matchAll(/(\S+) --> (\S+)/g)].map((m) => [m[1], m[2]]);
    expect(times[0]![0]).toBe("00:00:01.200");
    // Kalimat pertama berakhir 1,2 s + 6 s.
    expect(times[times.length - 2]![1]).toBe("00:00:07.200");
    expect(times.at(-1)).toEqual(["00:00:09.000", "00:00:11.000"]);
  });

  it("dipecah per kalimat; setiap cue ≤ 2 baris dan baris ≤ 42 karakter", () => {
    const cues = toVtt(timeline).split("\n\n").slice(1);
    expect(cues[0]).toContain("Dataset adalah tempat menyimpan data");
    expect(cues.some((c) => c.includes("Kita mulai"))).toBe(true);
    for (const c of cues) {
      const lines = c.trim().split("\n").slice(1);
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(42);
    }
  });
});
