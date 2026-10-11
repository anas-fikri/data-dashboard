import { describe, expect, it } from "vitest";
import { findPlaceholderVars, parseEnv } from "@/lib/env";

const valid: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3100",
  APP_HOST: "localhost:3100",
  DATABASE_URL: "postgresql://app:dummy@127.0.0.1:5433/db",
  REDIS_URL: "redis://:dummy@127.0.0.1:6380/0",
  S3_ENDPOINT: "http://127.0.0.1:9100",
  S3_PUBLIC_ENDPOINT: "http://localhost:9100",
  S3_BUCKET: "data-dashboard",
  S3_ACCESS_KEY: "app-key",
  S3_SECRET_KEY: "dummy-secret-key",
  SMTP_URL: "smtp://127.0.0.1:1026",
  MAIL_FROM: "no-reply@example.com",
  AUTH_SECRET: "x".repeat(32),
  ALLOWED_EMAIL_DOMAINS: " PCPExpress.com, innaka.dev ,",
};

describe("parseEnv", () => {
  it("menerima env lengkap dan menormalkan domain serta AUTH_SECRET", () => {
    const env = parseEnv(valid);
    expect(env.ALLOWED_EMAIL_DOMAINS).toEqual(["pcpexpress.com", "innaka.dev"]);
    expect(env.AUTH_SECRET).toEqual(["x".repeat(32)]);
    expect(env.MAX_UPLOAD_BYTES).toBe(1024 * 1024 * 1024);
    expect(env.TRUST_PROXY).toBe(false);
  });

  it("gagal cepat dengan nama variabel yang hilang", () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("menolak AUTH_SECRET pendek dan menerima beberapa secret untuk rotasi", () => {
    expect(() => parseEnv({ ...valid, AUTH_SECRET: "secret" })).toThrow(/AUTH_SECRET/);
    expect(() => parseEnv({ ...valid, AUTH_SECRET: `${"a".repeat(32)},short` })).toThrow(
      /AUTH_SECRET/,
    );
    expect(
      parseEnv({ ...valid, AUTH_SECRET: `${"a".repeat(32)}, ${"b".repeat(40)}` }).AUTH_SECRET,
    ).toHaveLength(2);
  });

  it("menolak REDIS_URL tanpa password", () => {
    expect(() => parseEnv({ ...valid, REDIS_URL: "redis://127.0.0.1:6380/0" })).toThrow(
      /REDIS_URL/,
    );
  });

  it("menolak ALLOWED_EMAIL_DOMAINS kosong atau tidak valid", () => {
    expect(() => parseEnv({ ...valid, ALLOWED_EMAIL_DOMAINS: " , " })).toThrow(
      /ALLOWED_EMAIL_DOMAINS/,
    );
    expect(() => parseEnv({ ...valid, ALLOWED_EMAIL_DOMAINS: "bukan domain" })).toThrow(
      /ALLOWED_EMAIL_DOMAINS/,
    );
  });

  it("menolak LOG_LEVEL yang tidak dikenal", () => {
    expect(() => parseEnv({ ...valid, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });

  it("menolak start produksi bila masih ada placeholder, tetapi membiarkannya di development", () => {
    const withPlaceholder = { ...valid, S3_SECRET_KEY: "change-me-now" };
    expect(() => parseEnv({ ...withPlaceholder, NODE_ENV: "production" })).toThrow(
      /Menolak start produksi.*S3_SECRET_KEY/,
    );
    expect(() => parseEnv({ ...withPlaceholder, NODE_ENV: "development" })).not.toThrow();
  });
});

describe("findPlaceholderVars", () => {
  it("kosong bila tidak ada placeholder", () => {
    expect(findPlaceholderVars(valid)).toEqual([]);
  });

  it("mendeteksi nilai dari .env.example tanpa peduli kapital", () => {
    const withPlaceholders = {
      ...valid,
      AUTH_SECRET: "Change-Me",
      S3_ACCESS_KEY: "MinioAdmin",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/db",
    };
    expect(findPlaceholderVars(withPlaceholders).sort()).toEqual(
      ["AUTH_SECRET", "DATABASE_URL", "S3_ACCESS_KEY"].sort(),
    );
  });
});
