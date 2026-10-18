import { describe, expect, it } from "vitest";
import { audioName } from "../../scripts/guide-audio.mjs";

/* T-3k08: cache audio narasi — berganti penyedia/suara/tempo berarti file baru, bukan audio lama. */
describe("audioName", () => {
  const ardi = { provider: "edge", voiceName: "id-ID-ArdiNeural", rate: "+0%" };
  const text = "Dataset adalah tempat menyimpan data Anda.";

  it("is stable for the same voice and text", () => {
    expect(audioName(ardi, text)).toBe(audioName({ ...ardi }, text));
    expect(audioName(ardi, text)).toMatch(/^[0-9a-f]{16}\.mp3$/);
  });

  it("changes with provider, voice, rate, or text", () => {
    const base = audioName(ardi, text);
    expect(audioName({ provider: "gemini", voiceName: "Kore" }, text)).not.toBe(base);
    expect(audioName({ ...ardi, voiceName: "id-ID-GadisNeural" }, text)).not.toBe(base);
    expect(audioName({ ...ardi, rate: "-6%" }, text)).not.toBe(base);
    expect(audioName(ardi, `${text} `)).not.toBe(base);
  });
});
