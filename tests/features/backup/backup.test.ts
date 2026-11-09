import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-7psf / T-y8qq: Admin › Backup — validasi isian NAS Synology (SFTP), file konfigurasi (600, password
 * tidak pernah keluar), password tersimpan hanya untuk NAS + akun yang sama, kunci host wajib dari tes
 * koneksi, dan status dari service backup → peringatan admin.
 */
const ctx = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/env", () => ({ env: () => ({ BACKUP_CONFIG_DIR: ctx.dir }) }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/features/audit/service", () => audit);
const HOST_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGR1bW15LWhvc3Qta2V5LXVudHVrLXRlcy0wMDAwMDAw";
const probe = vi.hoisted(() => ({
  probeOffsite: vi.fn(
    async (): Promise<{ ok: true; hostKey: string } | { ok: false; message: string }> => ({
      ok: true,
      hostKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGR1bW15LWhvc3Qta2V5LXVudHVrLXRlcy0wMDAwMDAw",
    }),
  ),
}));
vi.mock("@/features/backup/probe", () => probe);

const config = await import("@/features/backup/config");
const service = await import("@/features/backup/service");
const { probeMessage, spaceFromStatvfs } =
  await vi.importActual<typeof import("@/features/backup/probe")>("@/features/backup/probe");
const display = await import("@/features/backup/display");
const fmt = await import("@/components/admin/backup-format");

const SECRET = "dummy-nas-password-uji";
const ACTOR = { id: "admin1", email: "admin@pcpexpress.com" };
const input = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  host: " NAS.PCPEXPRESS.LAN ",
  port: "22",
  username: "dashboard-backup",
  password: SECRET,
  folder: "backup-data-dashboard/",
  hostKey: HOST_KEY,
  ...over,
});
const stored = () => JSON.parse(readFileSync(join(ctx.dir, "app/offsite.json"), "utf8"));

beforeEach(() => {
  ctx.dir = mkdtempSync(join(tmpdir(), "dd-backup-cfg-"));
  vi.clearAllMocks();
});
afterEach(() => rmSync(ctx.dir, { recursive: true, force: true }));

describe("parseOffsite", () => {
  it("menormalkan host, port, dan folder", () => {
    expect(config.parseOffsite(input())).toEqual({
      ok: true,
      data: expect.objectContaining({
        host: "nas.pcpexpress.lan",
        port: 22,
        folder: "/backup-data-dashboard",
      }),
    });
    expect(config.parseOffsite(input({ folder: "/Backup Server/data dashboard" }))).toMatchObject({
      ok: true,
      data: { folder: "/Backup Server/data dashboard" },
    });
    expect(config.parseOffsite(input({ hostKey: "" }))).toMatchObject({ ok: true });
  });

  it.each([
    ["host", "nas pcp"],
    ["host", "-oProxyCommand=x"],
    ["host", "nas\nlain"],
    ["port", "0"],
    ["port", "ssh"],
    ["username", "akun spasi"],
    ["username", ""],
    ["password", "baris\nbaru"],
    ["folder", "/"],
    ["folder", "/data/../lain"],
    ["folder", "/data//lain"],
    ["folder", "/data\n--config"],
    ["hostKey", "ssh-dss AAAAB3NzaC1kc3MAAACBAP"],
    ["hostKey", `${HOST_KEY}\nlain`],
  ])("menolak %s = %j dengan nama kolomnya", (field, value) => {
    expect(config.parseOffsite(input({ [field]: value }))).toMatchObject({ ok: false, field });
  });
});

describe("backupAlert", () => {
  const base = {
    state: "ok" as const,
    target: "nas/b",
    pending: 0,
    pendingSince: null,
    lastBackupAt: new Date().toISOString(),
    lastBackupOk: true,
    lastArchive: "dashboard-x.tar.age",
    lastSizeBytes: 10,
    lastOffsiteOkAt: null,
    error: null,
    updatedAt: new Date().toISOString(),
    syncFailures: 0,
    nextSyncAt: null,
    lastRequestAt: null,
    retention: null,
    archives: [],
    localBytes: null,
    disk: null,
    remote: null,
    nasSpace: null,
  };

  it("normal → tanpa peringatan; belum ada status → tanpa peringatan", () => {
    expect(config.backupAlert(base)).toBeNull();
    expect(config.backupAlert(null)).toBeNull();
    expect(config.backupAlert({ ...base, state: "off" })).toBeNull();
  });

  it("gagal, > 26 jam, dan tertunda → peringatan dengan nada yang sesuai", () => {
    expect(config.backupAlert({ ...base, state: "failed", lastBackupOk: false })).toMatchObject({
      tone: "error",
      text: "Backup terakhir gagal.",
    });
    expect(config.backupAlert({ ...base, state: "failed" })).toMatchObject({
      tone: "error",
      text: expect.stringContaining("off-VM tidak bisa dijalankan"),
    });
    const old = new Date(Date.now() - 27 * 3600_000).toISOString();
    expect(config.backupAlert({ ...base, lastBackupAt: old })).toMatchObject({
      tone: "error",
      text: expect.stringContaining("26 jam"),
    });
    expect(config.backupAlert({ ...base, state: "pending", pending: 3 })).toMatchObject({
      tone: "warning",
      text: expect.stringContaining("3 arsip"),
    });
  });
});

describe("status.json dari service backup", () => {
  it("dibaca apa adanya; file rusak atau tidak ada → null", async () => {
    expect(await config.readStatus()).toBeNull();
    writeFileSync(
      join(ctx.dir, "status.json"),
      JSON.stringify({
        state: "pending",
        pending: 2,
        target: "nas/b",
        updatedAt: "2026-10-18T00:00:00Z",
        notified: "pending",
      }),
    );
    expect(await config.readStatus()).toMatchObject({
      state: "pending",
      pending: 2,
      lastBackupAt: null,
    });
    writeFileSync(join(ctx.dir, "status.json"), "{rusak");
    expect(await config.readStatus()).toBeNull();
  });
});

describe("saveOffsite / testOffsite", () => {
  it("menyimpan offsite.json 600 untuk backup.sh; password tidak kembali ke browser, log, atau audit", async () => {
    const r = await service.saveOffsite(ACTOR, input(), "10.0.0.1");
    expect(r).toMatchObject({
      ok: true,
      data: {
        hasPassword: true,
        host: "nas.pcpexpress.lan",
        hostKey: HOST_KEY,
        fingerprint: config.fingerprint(HOST_KEY),
      },
    });
    expect(JSON.stringify(r)).not.toContain(SECRET);
    const file = join(ctx.dir, "app/offsite.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(stored()).toMatchObject({
      enabled: true,
      host: "nas.pcpexpress.lan",
      port: 22,
      folder: "/backup-data-dashboard",
      password: SECRET,
      hostKey: HOST_KEY,
      updatedBy: ACTOR.email,
    });
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    const entry = (audit.recordAudit.mock.calls[0] as unknown[])[1];
    expect(entry).toMatchObject({
      actorId: ACTOR.id,
      action: "backup.target.update",
      targetType: "system",
      meta: { enabled: true, hostKey: config.fingerprint(HOST_KEY), passwordChanged: true },
      ip: "10.0.0.1",
    });
    expect(JSON.stringify(entry)).not.toContain(SECRET);
    expect(await config.readOffsite()).toMatchObject({ host: "nas.pcpexpress.lan" });
  });

  it("tanpa kunci host (belum dites) → tidak disimpan", async () => {
    const r = await service.saveOffsite(ACTOR, input({ hostKey: "" }), "ip");
    expect(r).toMatchObject({
      ok: false,
      code: "INVALID",
      message: expect.stringContaining("Tes koneksi"),
    });
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("password kosong → dipakai ulang hanya untuk NAS, port, dan username yang sama", async () => {
    expect(await service.saveOffsite(ACTOR, input({ password: "" }), "ip")).toMatchObject({
      ok: false,
      field: "password",
      message: "Isi password.",
    });
    await service.saveOffsite(ACTOR, input(), "ip");
    const r = await service.saveOffsite(
      ACTOR,
      input({ password: "", folder: "/lain", enabled: false }),
      "ip",
    );
    expect(r).toMatchObject({
      ok: true,
      data: { folder: "/lain", hasPassword: true, enabled: false },
    });
    expect(stored().password).toBe(SECRET);
    expect((audit.recordAudit.mock.calls[1] as unknown[])[1]).toMatchObject({
      meta: { passwordChanged: false },
    });

    // Kunci host dilupakan (TOFU) atau diganti klien → password tersimpan tidak ikut (review T-y8qq #1).
    const other = HOST_KEY.replace("GR1bW15", "GxhaW5u");
    for (const over of [
      { host: "nas-lain.lan" },
      { port: "2222" },
      { username: "akun-lain" },
      { hostKey: "" },
      { hostKey: other },
    ]) {
      expect(await service.testOffsite(input({ ...over, password: "" }))).toMatchObject({
        ok: false,
        field: "password",
        message: expect.stringContaining("isi password lagi"),
      });
    }
    expect(
      await service.saveOffsite(ACTOR, input({ password: "", hostKey: other }), "ip"),
    ).toMatchObject({
      ok: false,
      field: "password",
    });
    expect(probe.probeOffsite).not.toHaveBeenCalled();

    probe.probeOffsite.mockResolvedValueOnce({
      ok: false,
      message: "Folder /lain tidak ditemukan.",
    });
    expect(await service.testOffsite(input({ password: "" }))).toEqual({
      ok: false,
      code: "UNAVAILABLE",
      message: "Folder /lain tidak ditemukan.",
    });
    expect(probe.probeOffsite).toHaveBeenCalledWith(expect.objectContaining({ password: SECRET }));
    expect(await service.testOffsite(input({ hostKey: "" }))).toEqual({
      ok: true,
      data: { hostKey: HOST_KEY, fingerprint: config.fingerprint(HOST_KEY), space: null },
    });
  });

  it("file lama format S3 → dianggap belum diatur", async () => {
    const dir = join(ctx.dir, "app");
    await import("node:fs").then((fs) => fs.mkdirSync(dir, { recursive: true }));
    writeFileSync(
      join(dir, "offsite.json"),
      JSON.stringify({
        enabled: true,
        endpoint: "http://x:9000",
        bucket: "b",
        secretAccessKey: "s",
      }),
    );
    expect(await config.readOffsite()).toBeNull();
    expect((await service.getBackupPage()).offsite).toBeNull();
  });

  it("folder konfigurasi tidak bisa ditulis → pesan untuk pengelola server, tanpa audit", async () => {
    const blocker = join(ctx.dir, "bukan-folder");
    writeFileSync(blocker, "");
    ctx.dir = blocker;
    const r = await service.saveOffsite(ACTOR, input(), "ip");
    expect(r).toMatchObject({ ok: false, code: "UNAVAILABLE" });
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });
});

describe("probeMessage", () => {
  const c = { folder: "/backup", hostKey: "" };
  it.each([
    [{ level: "client-authentication" }, c, "", "Username atau password ditolak"],
    [{ level: "client-timeout" }, c, "", "Tidak bisa terhubung"],
    [{ code: "ENOTFOUND" }, c, "", "Tidak bisa terhubung"],
    [{ message: "closed" }, c, "", "Tidak bisa terhubung"],
    [{ level: "handshake" }, { ...c, hostKey: HOST_KEY }, "", "kunci host NAS tidak cocok"],
    [{ code: 2 }, c, "", "Folder /backup tidak ditemukan"],
    [{ code: 3 }, c, "", "tidak punya izin"],
    [{ level: "aneh" }, c, "", "Tes gagal (aneh)"],
  ])("%j → %s", (err, conf, seen, text) => {
    expect(probeMessage(err, conf, seen)).toContain(text);
  });
});

describe("lama simpan, kirim ulang, status baru (T-tsvf)", () => {
  const exists = (f: string) => existsSync(join(ctx.dir, f));

  it.each([
    [{ localDays: "", remoteDays: "30" }, "localDays", "harus angka"],
    [{ localDays: "2", remoteDays: "30" }, "localDays", "minimal 3"],
    [{ localDays: "7", remoteDays: "6" }, "remoteDays", "minimal 7"],
    [{ localDays: "3.5", remoteDays: "30" }, "localDays", "bilangan bulat"],
    [{ localDays: "7", remoteDays: "366" }, "remoteDays", "maksimal 365"],
    [{ localDays: "7", remoteDays: "abc" }, "remoteDays", "harus angka"],
  ])("menolak %j di kolom %s", async (value, field, text) => {
    const r = await service.saveRetention(ACTOR, value, "ip");
    expect(r).toMatchObject({ ok: false, code: "INVALID", field });
    expect(r.ok ? "" : r.message).toContain(text);
    expect(exists("app/retention.json")).toBe(false);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("simpan → retention.json 600 + audit + permintaan penerapan; bawaan → file dihapus", async () => {
    const r = await service.saveRetention(
      ACTOR,
      { localDays: " 7 ", remoteDays: "30" },
      "10.0.0.1",
    );
    expect(r).toMatchObject({
      ok: true,
      data: { localDays: 7, remoteDays: 30, updatedBy: ACTOR.email },
    });
    const file = join(ctx.dir, "app/retention.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ localDays: 7, remoteDays: 30 });
    expect(await config.readRetention()).toMatchObject({ localDays: 7, remoteDays: 30 });
    expect(exists("app/sync-request")).toBe(true);
    expect((audit.recordAudit.mock.calls[0] as unknown[])[1]).toMatchObject({
      action: "backup.retention.update",
      meta: { localDays: 7, remoteDays: 30 },
      ip: "10.0.0.1",
    });

    expect(await service.resetRetention(ACTOR, "ip")).toEqual({ ok: true, data: null });
    expect(exists("app/retention.json")).toBe(false);
    expect(await config.readRetention()).toBeNull();
    expect((audit.recordAudit.mock.calls[1] as unknown[])[1]).toMatchObject({
      action: "backup.retention.reset",
    });
  });

  it("kirim ulang sekarang: permintaan ditulis sekali (diaudit sekali) sampai diambil service backup", async () => {
    expect(await service.requestSync(ACTOR, "ip")).toEqual({
      ok: true,
      data: { requested: true, running: null },
    });
    expect(await service.requestSync(ACTOR, "ip")).toMatchObject({ ok: true });
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    expect((audit.recordAudit.mock.calls[0] as unknown[])[1]).toMatchObject({
      action: "backup.sync.request",
    });
    expect((await service.getBackupPage()).sync).toEqual({ requested: true, running: null });
    rmSync(join(ctx.dir, "app/sync-request"));
    expect((await service.getSyncState()).sync.requested).toBe(false);
  });

  it("simpan NAS aktif → permintaan kirim ulang; nonaktif → tanpa permintaan", async () => {
    await service.saveOffsite(ACTOR, input({ enabled: false }), "ip");
    expect(exists("app/sync-request")).toBe(false);
    await service.saveOffsite(ACTOR, input(), "ip");
    expect(exists("app/sync-request")).toBe(true);
  });

  it("running.json: run berjalan terbaca; sisa run > 12 jam diabaikan", async () => {
    const write = (since: string) =>
      writeFileSync(join(ctx.dir, "running.json"), JSON.stringify({ kind: "sync", since }));
    write(new Date().toISOString());
    expect(await config.readRunning()).toMatchObject({ kind: "sync" });
    write(new Date(Date.now() - 13 * 3600_000).toISOString());
    expect(await config.readRunning()).toBeNull();
  });

  it("status baru terbaca utuh; bagian yang rusak jatuh ke bawaan tanpa membuang status", async () => {
    const base = { state: "pending", pending: 1, updatedAt: "2026-11-09T10:00:00Z" };
    writeFileSync(
      join(ctx.dir, "status.json"),
      JSON.stringify({
        ...base,
        syncFailures: 2,
        nextSyncAt: "2026-11-09T11:00:00Z",
        retention: { localDays: 7, remoteDays: 30, source: "app" },
        archives: [{ name: "dashboard-20261109T190000Z.tar.age", sizeBytes: 5, offsite: false }],
        localBytes: 5,
        disk: { totalBytes: 100, freeBytes: 40 },
        remote: { target: "t", count: 1, bytes: 5, oldest: null, newest: null, checkedAt: "x" },
        nasSpace: { target: "t", totalBytes: 10, freeBytes: 1, checkedAt: "x" },
      }),
    );
    expect(await config.readStatus()).toMatchObject({
      syncFailures: 2,
      nextSyncAt: "2026-11-09T11:00:00Z",
      retention: { source: "app" },
      archives: [{ sizeBytes: 5 }],
      disk: { freeBytes: 40 },
      nasSpace: { freeBytes: 1 },
    });
    writeFileSync(
      join(ctx.dir, "status.json"),
      JSON.stringify({ ...base, archives: "rusak", disk: { totalBytes: -1 }, syncFailures: "x" }),
    );
    expect(await config.readStatus()).toMatchObject({
      state: "pending",
      archives: [],
      disk: null,
      syncFailures: 0,
      retention: null,
    });
  });
});

describe("tampilan Admin › Backup (T-tsvf)", () => {
  it.each([
    ['Update ReadFrom failed: sftp: "Failure" (SSH_FX_FAILURE)', "ruang penyimpanan NAS penuh"],
    ["sftp: permission denied", "tidak punya izin"],
    ["ssh: unable to authenticate, attempted methods [none password]", "username atau password"],
    ["dial tcp 10.3.3.50:22: i/o timeout", "tidak bisa terhubung"],
    ["konfigurasi NAS dari aplikasi tidak terbaca", "Pengaturan NAS tidak terbaca"],
    ["backup gagal di langkah: pg_dump", "log service backup"],
  ])("errorHint(%s) → %s", (error, text) => {
    expect(display.errorHint(error)).toContain(text);
  });

  it("errorHint galat tak dikenal/kosong → null; archiveTime; lowSpace", () => {
    expect(display.errorHint("sesuatu yang aneh")).toBeNull();
    expect(display.errorHint(null)).toBeNull();
    expect(display.archiveTime("dashboard-20261109T190000Z.tar.age")).toBe("2026-11-09T19:00:00Z");
    expect(display.archiveTime("lain.tar.age")).toBeNull();
    expect(display.lowSpace(100, 60)).toBe(true);
    expect(display.lowSpace(120, 60)).toBe(false);
    expect(display.lowSpace(1, null)).toBe(false);
  });

  it("spaceFromStatvfs: number/BigInt, f_frsize 0 → f_bsize, isi aneh → null", () => {
    const st = { f_bsize: 4096, f_frsize: 4096, f_blocks: 1000, f_bavail: 250 };
    expect(spaceFromStatvfs(st)).toEqual({ totalBytes: 4096000, freeBytes: 1024000 });
    expect(spaceFromStatvfs({ ...st, f_frsize: 0, f_blocks: 10n, f_bavail: 5n })).toEqual({
      totalBytes: 40960,
      freeBytes: 20480,
    });
    expect(spaceFromStatvfs({ ...st, f_bavail: 2000 })).toBeNull();
    expect(spaceFromStatvfs({ f_blocks: "x" })).toBeNull();
    expect(spaceFromStatvfs(undefined)).toBeNull();
  });

  it("format WIB dan ukuran sama di server dan browser (tanpa Intl)", () => {
    expect(fmt.formatWib("2026-11-09T10:05:00Z")).toBe("9 Nov 2026 17.05 WIB");
    expect(fmt.formatWib("2026-12-31T17:30:00Z")).toBe("1 Jan 2027 00.30 WIB");
    expect(fmt.formatWib(null)).toBeNull();
    expect(fmt.formatWibTime("2026-11-09T10:05:00Z")).toBe("17.05 WIB");
    expect(fmt.formatSize(500)).toBe("1 KB");
    expect(fmt.formatSize(429 * 1024 ** 2)).toBe("429 MB");
    expect(fmt.formatSize(1.15 * 1024 ** 3)).toBe("1,1 GB");
    expect(fmt.formatSize(2 * 1024 ** 3)).toBe("2 GB");
    expect(fmt.formatSize(4 * 1024 ** 4)).toBe("4 TB");
  });
});
