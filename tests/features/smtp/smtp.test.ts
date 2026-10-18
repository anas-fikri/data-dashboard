import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-byys: Admin › Email — pengaturan SMTP dari .env atau app/smtp.json (600), email uji, simpan tanpa
 * password keluar ke browser/audit/log, dan mailer() yang dibuat ulang saat pengaturan berubah.
 */
const ctx = vi.hoisted(() => ({
  dir: "",
  SMTP_URL: "smtps://noreply-dashboard%40contoh.co.id:dummy%40pw@mail.contoh.co.id:465",
  MAIL_FROM: "Data Dashboard <noreply-dashboard@contoh.co.id>",
}));
vi.mock("@/lib/env", () => ({
  env: () => ({ BACKUP_CONFIG_DIR: ctx.dir, SMTP_URL: ctx.SMTP_URL, MAIL_FROM: ctx.MAIL_FROM }),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/features/audit/service", () => audit);
const mail = vi.hoisted(() => ({
  sendMail: vi.fn(async (_m: unknown): Promise<unknown> => ({ messageId: "x" })),
  close: vi.fn(),
  createTransport: vi.fn((_o: unknown) => ({ sendMail: mail.sendMail, close: mail.close })),
}));
vi.mock("nodemailer", () => ({ default: { createTransport: mail.createTransport } }));

const settings = await import("@/lib/smtp-settings");
const service = await import("@/features/smtp/service");
const { mailer, mailFrom } = await import("@/lib/mail");

const PW = "dummy-smtp-password:7pA";
const ACTOR = { id: "admin1", email: "admin@pcpexpress.com" };
const input = (over: Record<string, unknown> = {}) => ({
  host: "mail.pcpexpress.com",
  port: "465",
  security: "ssl",
  username: "noreply-dashboard@pcpexpress.co.id",
  password: PW,
  fromAddress: "noreply-dashboard@pcpexpress.co.id",
  fromName: "Data Dashboard",
  ...over,
});
const file = () => join(ctx.dir, "app/smtp.json");

beforeEach(() => {
  ctx.dir = mkdtempSync(join(tmpdir(), "dd-smtp-"));
  vi.clearAllMocks();
});
afterEach(() => rmSync(ctx.dir, { recursive: true, force: true }));

describe("pengaturan bawaan server (.env)", () => {
  it("SMTP_URL + MAIL_FROM diurai: SSL dari smtps, kredensial di-decode", () => {
    expect(settings.envSmtp()).toEqual({
      host: "mail.contoh.co.id",
      port: 465,
      security: "ssl",
      username: "noreply-dashboard@contoh.co.id",
      password: "dummy@pw",
      fromName: "Data Dashboard",
      fromAddress: "noreply-dashboard@contoh.co.id",
    });
    expect(service.getSmtpPage()).toMatchObject({ source: "env", hasPassword: true });
    expect(JSON.stringify(service.getSmtpPage())).not.toContain("dummy@pw");
  });

  it("transportOptions mengikuti pilihan keamanan; tanpa username tanpa auth", () => {
    const base = settings.envSmtp();
    expect(settings.transportOptions(base)).toMatchObject({ secure: true, requireTLS: false });
    expect(settings.transportOptions({ ...base, security: "starttls", port: 587 })).toMatchObject({
      secure: false,
      requireTLS: true,
    });
    expect(settings.transportOptions({ ...base, security: "none", username: "" })).toMatchObject({
      ignoreTLS: true,
      auth: undefined,
    });
  });
});

describe("saveSmtp / testSmtp", () => {
  it("menyimpan app/smtp.json 600; password tidak kembali ke browser atau audit; mailer memakainya", async () => {
    const r = await service.saveSmtp(ACTOR, input(), "10.0.0.1");
    expect(r).toMatchObject({
      ok: true,
      data: { source: "app", host: "mail.pcpexpress.com", hasPassword: true },
    });
    expect(JSON.stringify(r)).not.toContain(PW);
    expect(statSync(file()).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(file(), "utf8"))).toMatchObject({
      port: 465,
      password: PW,
      updatedBy: ACTOR.email,
    });
    const entry = (audit.recordAudit.mock.calls[0] as unknown[])[1];
    expect(entry).toMatchObject({
      action: "smtp.settings.update",
      targetType: "system",
      meta: { host: "mail.pcpexpress.com", passwordChanged: true },
    });
    expect(JSON.stringify(entry)).not.toContain(PW);

    mailer();
    expect(mail.createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ host: "mail.pcpexpress.com", port: 465, secure: true }),
    );
    expect(mailFrom()).toEqual({
      name: "Data Dashboard",
      address: "noreply-dashboard@pcpexpress.co.id",
    });
  });

  it("password dikosongkan → password yang berlaku dipakai (.env lalu file), server yang sama", async () => {
    const sameAsEnv = { host: "mail.contoh.co.id", username: "noreply-dashboard@contoh.co.id" };
    await service.saveSmtp(ACTOR, input({ ...sameAsEnv, password: "" }), "ip");
    expect(JSON.parse(readFileSync(file(), "utf8")).password).toBe("dummy@pw");
    await service.saveSmtp(ACTOR, input({ password: PW }), "ip");
    await service.saveSmtp(ACTOR, input({ password: "", fromName: "Dasbor" }), "ip");
    expect(JSON.parse(readFileSync(file(), "utf8"))).toMatchObject({
      password: PW,
      fromName: "Dasbor",
    });
  });

  it.each([
    ["host", "mail server"],
    ["port", "70000"],
    ["fromAddress", "bukan-email"],
    ["password", "baris\nbaru"],
  ])("menolak %s = %j dengan nama kolomnya", async (field, value) => {
    expect(await service.saveSmtp(ACTOR, input({ [field]: value }), "ip")).toMatchObject({
      ok: false,
      field,
    });
  });

  it("email uji: terkirim + diaudit tanpa password; galat SMTP → pesan yang bisa ditindak", async () => {
    expect(await service.testSmtp(ACTOR, input(), "Anas.Fikri@pcpexpress.com", "ip")).toEqual({
      ok: true,
      data: { to: "anas.fikri@pcpexpress.com" },
    });
    expect(mail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "anas.fikri@pcpexpress.com",
        from: { name: "Data Dashboard", address: "noreply-dashboard@pcpexpress.co.id" },
      }),
    );
    const entry = (audit.recordAudit.mock.calls[0] as unknown[])[1];
    expect(entry).toMatchObject({
      action: "smtp.settings.test",
      meta: { host: "mail.pcpexpress.com", to: "anas.fikri@pcpexpress.com" },
    });
    expect(JSON.stringify(entry)).not.toContain(PW);
    mail.sendMail.mockRejectedValueOnce(
      Object.assign(new Error("Invalid login"), { code: "EAUTH" }),
    );
    expect(await service.testSmtp(ACTOR, input(), "a@pcpexpress.com", "ip")).toMatchObject({
      ok: false,
      message: "Username atau password ditolak server SMTP.",
    });
    expect(await service.testSmtp(ACTOR, input(), "bukan", "ip")).toMatchObject({
      ok: false,
      field: "testTo",
    });
  });
});

describe("smtpMessage", () => {
  it.each([
    [{ code: "EAUTH" }, "ditolak"],
    [{ code: "ESOCKET", message: "wrong version number" }, "TLS"],
    [{ code: "ETIMEDOUT" }, "Tidak bisa terhubung"],
    [{ code: "EENVELOPE", response: "550 sender rejected" }, "550 sender rejected"],
    [{ code: "EODD" }, "Gagal mengirim (EODD)"],
  ])("%j → %s", (err, text) => {
    expect(service.smtpMessage(err)).toContain(text);
  });
});

describe("mailer() tanpa pengaturan aplikasi", () => {
  it("memakai SMTP_URL; berganti ke pengaturan baru tanpa restart", () => {
    mailer();
    expect(mail.createTransport).toHaveBeenLastCalledWith(
      expect.stringContaining("mail.contoh.co.id"),
    );
    expect(mailFrom()).toBe(ctx.MAIL_FROM);
    mkdirSync(join(ctx.dir, "app"), { recursive: true });
    writeFileSync(file(), JSON.stringify({ ...input(), port: 587, security: "starttls" }));
    mailer();
    expect(mail.createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ port: 587, requireTLS: true }),
    );
    expect(mail.close).toHaveBeenCalled();
  });
});

describe("password yang berlaku tidak bisa dibawa ke server lain (review T-byys #1)", () => {
  it("host/port/username berubah atau turun ke teks polos dengan password kosong → INVALID", async () => {
    // .env: mail.contoh.co.id:465 ssl, username noreply-dashboard@contoh.co.id
    const env = {
      host: "mail.contoh.co.id",
      username: "noreply-dashboard@contoh.co.id",
      password: "",
    };
    for (const over of [
      { host: "evil.contoh" },
      { port: "25" },
      { username: "lain@contoh.co.id" },
      { security: "none" },
    ]) {
      expect(
        await service.testSmtp(ACTOR, input({ ...env, ...over }), "a@pcpexpress.com", "ip"),
      ).toMatchObject({ ok: false, field: "password" });
    }
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(await service.testSmtp(ACTOR, input(env), "a@pcpexpress.com", "ip")).toMatchObject({
      ok: true,
    });
    expect(mail.createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ auth: { user: env.username, pass: "dummy@pw" } }),
    );
  });

  it("smtp:// di .env: server sungguhan → STARTTLS, relay lokal → tanpa enkripsi", () => {
    const keep = ctx.SMTP_URL;
    ctx.SMTP_URL = "smtp://u%40x.id:pw@mail.contoh.co.id:25";
    expect(settings.envSmtp()).toMatchObject({ security: "starttls", port: 25 });
    ctx.SMTP_URL = "smtp://127.0.0.1:2526";
    expect(settings.envSmtp()).toMatchObject({ security: "none" });
    ctx.SMTP_URL = keep;
  });
});
