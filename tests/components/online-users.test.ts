import { describe, expect, it } from "vitest";
import { agoText } from "@/components/admin/online-users";

describe("agoText (T-h807)", () => {
  it("< 1 menit → baru saja; selebihnya menit", () => {
    const now = Date.parse("2026-11-17T05:00:00Z");
    expect(agoText("2026-11-17T04:59:30Z", now)).toBe("baru saja");
    expect(agoText("2026-11-17T04:57:00Z", now)).toBe("3 menit lalu");
    expect(agoText("2026-11-17T05:00:10Z", now)).toBe("baru saja"); // jam server sedikit di depan
  });
});
