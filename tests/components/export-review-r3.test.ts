import { describe, expect, it, vi } from "vitest";
import { revealKeyboardFocus } from "@/components/widgets/export-menu";

/*
 * Review T-017 putaran 3 (R3-CL-1): menu ekspor hanya menggulir kontrol terfokus untuk fokus keyboard.
 * Fokus dari tekan mouse/sentuh di tepi gulir tidak boleh menggeser tombol sebelum klik selesai.
 */
const el = (focusVisible: boolean) => ({
  matches: vi.fn((sel: string) => sel === ":focus-visible" && focusVisible),
  scrollIntoView: vi.fn(),
});

describe("revealKeyboardFocus", () => {
  it("fokus keyboard (Tab berputar) → digulir seperlunya ke area terlihat", () => {
    const e = el(true);
    revealKeyboardFocus(e);
    expect(e.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("fokus dari tekan mouse/sentuh → tidak digulir (klik di tepi tetap sampai)", () => {
    const e = el(false);
    revealKeyboardFocus(e);
    expect(e.scrollIntoView).not.toHaveBeenCalled();
  });
});
