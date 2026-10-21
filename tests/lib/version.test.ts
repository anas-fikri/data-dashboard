import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppVersion, rendererVersionInfo } from "../../renderer/version";
import { APP_VERSION, appCommit, versionInfo } from "@/lib/version";

const pkgVersion = (
  JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string }
).version;

describe("versi aplikasi (T-066)", () => {
  it("APP_VERSION = version di package.json (satu sumber)", () => {
    expect(APP_VERSION).toBe(pkgVersion);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("commit pendek hanya dari hash heksa 7–40, dipotong 12 karakter", () => {
    expect(appCommit("abc1234")).toBe("abc1234");
    expect(appCommit(" ABCDEF0123456789ABCDEF0123456789ABCDEF01 ")).toBe("abcdef012345");
    for (const bad of [undefined, "", "abc12", "unknown", "abc1234; rm -rf /", "g123456"]) {
      expect(appCommit(bad)).toBeNull();
    }
  });

  it("versionInfo menggabungkan versi + commit dari env", () => {
    expect(versionInfo({ APP_COMMIT: "1234567" })).toEqual({
      version: pkgVersion,
      commit: "1234567",
    });
    expect(versionInfo({}).commit).toBeNull();
  });

  it("renderer membaca versi yang sama dari package.json akar repo", () => {
    expect(rendererVersionInfo({ APP_COMMIT: "abcdef1" })).toEqual({
      version: pkgVersion,
      commit: "abcdef1",
    });
    expect(rendererVersionInfo({ APP_COMMIT: "bukan-hash" }).commit).toBeNull();
    expect(readAppVersion(new URL("file:///tidak/ada/package.json"))).toBe("unknown");
  });
});
