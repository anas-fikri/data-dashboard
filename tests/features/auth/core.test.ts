import { describe, expect, it } from "vitest";
import { isAllowedDomain, normalizeEmail } from "@/features/auth/email-domain";
import { SESSION_MAX_AGE_SEC, signSession, verifySession } from "@/features/auth/jwt";
import {
  dummyHash,
  hashPassword,
  isPasswordAcceptable,
  verifyPassword,
} from "@/features/auth/password";
import { loginUrl, safeNext } from "@/features/auth/redirect";
import { generateToken, hashToken, isTokenShape, tokensEqual } from "@/features/auth/tokens";

describe("password (argon2id)", () => {
  it("menerima 12–128 karakter saja", () => {
    expect(isPasswordAcceptable("a".repeat(11))).toBe(false);
    expect(isPasswordAcceptable("a".repeat(12))).toBe(true);
    expect(isPasswordAcceptable("a".repeat(128))).toBe(true);
    expect(isPasswordAcceptable("a".repeat(129))).toBe(false);
  });

  it("hash argon2id m=64MiB t=3 p=1 dan verifikasi", async () => {
    const h = await hashPassword("kalimat-panjang-yang-kuat");
    expect(h.startsWith("$argon2id$v=19$m=65536,t=3,p=1$")).toBe(true);
    expect(await verifyPassword(h, "kalimat-panjang-yang-kuat")).toBe(true);
    expect(await verifyPassword(h, "kalimat-panjang-yang-salah")).toBe(false);
  }, 20_000);

  it("hash null (akun seed) selalu ditolak meski verifikasi tetap dijalankan", async () => {
    expect(await verifyPassword(null, "apa-pun-isinya-12")).toBe(false);
    expect(await verifyPassword(null, "dummy-password-for-constant-time")).toBe(false);
    expect((await dummyHash()).startsWith("$argon2id$")).toBe(true);
  }, 20_000);

  it("hash rusak tidak melempar", async () => {
    expect(await verifyPassword("bukan-hash", "x".repeat(12))).toBe(false);
  });
});

describe("token verifikasi", () => {
  it("32 byte acak base64url, hanya hash yang dibandingkan secara konstan", () => {
    const t = generateToken();
    expect(isTokenShape(t)).toBe(true);
    expect(isTokenShape(t + "x")).toBe(false);
    expect(isTokenShape("../etc")).toBe(false);
    const h = hashToken(t);
    expect(h).toHaveLength(64);
    expect(tokensEqual(h, hashToken(t))).toBe(true);
    expect(tokensEqual(h, hashToken(generateToken()))).toBe(false);
  });
});

describe("JWT sesi (jose)", () => {
  const secrets = ["a".repeat(32), "b".repeat(32)];

  it("sign dengan secret pertama, verify mengembalikan sub + sv", async () => {
    const token = await signSession({ sub: "u1", sv: 3 }, secrets);
    expect(await verifySession(token, secrets)).toEqual({ sub: "u1", sv: 3 });
  });

  it("rotasi: token dari secret lama tetap valid, secret asing ditolak", async () => {
    const old = await signSession({ sub: "u1", sv: 1 }, ["b".repeat(32)]);
    expect(await verifySession(old, secrets)).toEqual({ sub: "u1", sv: 1 });
    expect(await verifySession(old, ["c".repeat(32)])).toBeNull();
  });

  it("kedaluwarsa setelah 12 jam dan tidak melempar untuk token rusak", async () => {
    const now = Date.now();
    const token = await signSession({ sub: "u1", sv: 1 }, secrets, now);
    expect(
      await verifySession(token, secrets, now + (SESSION_MAX_AGE_SEC - 5) * 1000),
    ).not.toBeNull();
    expect(await verifySession(token, secrets, now + (SESSION_MAX_AGE_SEC + 5) * 1000)).toBeNull();
    expect(await verifySession("abc.def", secrets)).toBeNull();
    expect(await verifySession("", secrets)).toBeNull();
  });
});

describe("safeNext (anti open-redirect)", () => {
  it("hanya path relatif internal", () => {
    expect(safeNext("/datasets")).toBe("/datasets");
    expect(safeNext("/datasets?x=1#y")).toBe("/datasets?x=1#y");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/javascript:alert(1)")).toBe("/");
    expect(safeNext("datasets")).toBe("/");
    expect(safeNext("/a\nb")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(42)).toBe("/");
  });

  it("loginUrl menyusun ?next= hanya bila bukan beranda", () => {
    expect(loginUrl("/datasets/1")).toBe("/login?next=%2Fdatasets%2F1");
    expect(loginUrl("/")).toBe("/login");
    expect(loginUrl("https://evil.example")).toBe("/login");
  });
});

describe("email dan whitelist domain", () => {
  it("normalisasi dan validasi bentuk", () => {
    expect(normalizeEmail("  Anas.Fikri@PCPExpress.com ")).toBe("anas.fikri@pcpexpress.com");
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("a b@pcpexpress.com")).toBeNull();
    expect(normalizeEmail("a@b@pcpexpress.com")).toBeNull();
    expect(normalizeEmail("ünïcode@pcpexpress.com")).toBeNull();
    expect(normalizeEmail(123)).toBeNull();
  });

  it("domain harus sama persis (bukan endsWith)", () => {
    const allowed = ["pcpexpress.com"];
    expect(isAllowedDomain("user@pcpexpress.com", allowed)).toBe(true);
    expect(isAllowedDomain("user@evilpcpexpress.com", allowed)).toBe(false);
    expect(isAllowedDomain("user@mail.pcpexpress.com", allowed)).toBe(false);
    expect(isAllowedDomain("user@pcpexpress.com.evil", allowed)).toBe(false);
  });
});
