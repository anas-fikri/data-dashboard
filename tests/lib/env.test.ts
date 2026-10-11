import { describe, expect, it } from "vitest";
import { findPlaceholderVars, parseEnv } from "@/lib/env";

const valid: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  APP_HOST: "localhost:3000",
  DATABASE_URL: "postgresql://app:s3cret@127.0.0.1:5432/db",
  REDIS_URL: "redis://:s3cret@127.0.0.1:6379/0",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "data-dashboard",
  S3_ACCESS_KEY: "app-key",
  S3_SECRET_KEY: "app-secret",
  SMTP_URL: "smtp://127.0.0.1:1025",
  MAIL_FROM: "no-reply@example.com",
  AUTH_SECRET: "x".repeat(32),
  ALLOWED_EMAIL_DOMAINS: " PCPExpress.com, innaka.dev ,",
};

describe("parseEnv", () => {
  it("menerima env lengkap dan menormalkan domain", () => {
    const env = parseEnv(valid);
    expect(env.ALLOWED_EMAIL_DOMAINS).toEqual(["pcpexpress.com", "innaka.dev"]);
    expect(env.MAX_UPLOAD_BYTES).toBe(1024 * 1024 * 1024);
    expect(env.TRUST_PROXY).toBe(false);
  });

  it("gagal cepat dengan nama variabel yang hilang", () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    void _omit;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("menolak APP_URL yang bukan URL", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "bukan-url" })).toThrow(/APP_URL/);
  });
});

describe("findPlaceholderVars", () => {
  it("kosong bila tidak ada placeholder", () => {
    expect(findPlaceholderVars(valid)).toEqual([]);
  });

  it("mendeteksi nilai dari .env.example", () => {
    const withPlaceholders = {
      ...valid,
      AUTH_SECRET: "change-me",
      S3_ACCESS_KEY: "minioadmin",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/db",
    };
    expect(findPlaceholderVars(withPlaceholders).sort()).toEqual(
      ["AUTH_SECRET", "DATABASE_URL", "S3_ACCESS_KEY"].sort(),
    );
  });
});
