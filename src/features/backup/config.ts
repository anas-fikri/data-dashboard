import "server-only";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { sharedConfigDir } from "@/lib/config-dir";
import { RETENTION_LIMITS } from "./display";
import type {
  BackupAlert,
  BackupRun,
  BackupStatus,
  OffsiteField,
  RetentionField,
  RetentionView,
} from "./types";

/*
 * Target backup off-VM yang diisi admin (T-7psf; NAS Synology lewat SFTP sejak T-y8qq) dan status dari
 * service backup, di volume bersama backup-config: app/offsite.json (600, ditulis app, dibaca
 * deploy/backup.sh) dan status.json (ditulis backup.sh; folder induk milik root sehingga app hanya bisa
 * menulis di app/). Password hanya ada di offsite.json — tidak di DB (tidak ikut arsip backup) dan tidak
 * di log.
 */

const configDir = sharedConfigDir;
const OFFSITE = join("app", "offsite.json");
const RETENTION = join("app", "retention.json");
const SYNC_REQUEST = join("app", "sync-request");
const STATUS = "status.json";
const RUNNING = "running.json";
/** running.json lebih tua dari ini = sisa container yang dimatikan paksa, bukan run yang masih berjalan. */
const RUN_STALE_MS = 12 * 60 * 60 * 1000;
/** Backup harian yang lebih tua dari ini dianggap tidak berjalan (jadwal 24 jam + jeda durasi). */
export const STALE_MS = 26 * 60 * 60 * 1000;

/** Kunci publik host SSH satu baris ("<tipe> <base64>"), seperti baris known_hosts tanpa nama host. */
export const HOST_KEY_RE =
  /^(ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-rsa) [A-Za-z0-9+/]{16,2048}={0,2}$/;

/** Sidik jari OpenSSH (SHA256:…) untuk dicocokkan admin dengan NAS. */
export function fingerprint(hostKey: string): string {
  const blob = Buffer.from(hostKey.split(" ")[1] ?? "", "base64");
  return `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;
}

const SEGMENT = /^[A-Za-z0-9._-]+( [A-Za-z0-9._-]+)*$/;

/**
 * Isian form NAS Synology (SFTP); nilai dibatasi ASCII tercetak tanpa baris baru (dibaca jq lalu env rclone
 * di backup.sh, yang memvalidasi ulang dengan aturan yang sama).
 */
export const offsiteSchema = z.object({
  enabled: z.boolean(),
  host: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^(?=.{1,253}$)[a-z0-9][a-z0-9-]{0,62}(\.[a-z0-9-]{1,63})*$/,
      "Isi nama atau alamat IP NAS, mis. 10.3.3.50 atau nas.pcpexpress.lan.",
    ),
  port: z.coerce
    .number({ message: "Port harus angka." })
    .int("Port harus angka.")
    .min(1, "Port 1–65535 (SFTP bawaan 22).")
    .max(65535, "Port 1–65535 (SFTP bawaan 22)."),
  username: z
    .string()
    .trim()
    .regex(/^[\x21-\x7e]{1,128}$/, "Isi username akun NAS (tanpa spasi)."),
  password: z
    .string()
    .max(256, "Password maksimal 256 karakter.")
    .regex(/^[\x20-\x7e]*$/, "Password hanya karakter ASCII tanpa baris baru."),
  folder: z
    .string()
    .trim()
    .max(200, "Folder maksimal 200 karakter.")
    .transform((v) => `/${v.replace(/^\/+|\/+$/g, "")}`)
    .refine(
      (v) =>
        v !== "/" &&
        v
          .slice(1)
          .split("/")
          .every((p) => SEGMENT.test(p) && p !== "." && p !== ".."),
      "Isi folder tujuan di NAS, mis. /backup-data-dashboard — huruf, angka, spasi, titik, garis bawah, tanda hubung, dan /.",
    ),
  hostKey: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || HOST_KEY_RE.test(v),
      "Kunci host tidak valid. Jalankan Tes koneksi lagi.",
    ),
});

export type ParsedOffsite = z.infer<typeof offsiteSchema>;

/** Isian yang divalidasi, atau galat pertama dengan nama kolomnya. */
export function parseOffsite(
  raw: unknown,
): { ok: true; data: ParsedOffsite } | { ok: false; field?: OffsiteField; message: string } {
  const r = offsiteSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const issue = r.error.issues[0];
  const field = issue?.path[0];
  return {
    ok: false,
    field: typeof field === "string" ? (field as OffsiteField) : undefined,
    message: issue?.message ?? "Isian tidak valid.",
  };
}

const storedSchema = offsiteSchema.extend({
  password: z.string().min(1),
  hostKey: z.string().regex(HOST_KEY_RE),
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export type StoredOffsite = z.infer<typeof storedSchema>;

async function readJson(name: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(configDir(), name), "utf8"));
  } catch (e) {
    // Belum ada / sedang ditulis ulang / rusak: diperlakukan sebagai belum diatur.
    if ((e as NodeJS.ErrnoException).code === "ENOENT" || e instanceof SyntaxError) return null;
    throw e;
  }
}

export async function readOffsite(): Promise<StoredOffsite | null> {
  const r = storedSchema.safeParse(await readJson(OFFSITE));
  return r.success ? r.data : null;
}

/** Tulis atomik (file sementara + rename), hanya bisa dibaca pemilik (user app) dan root (service backup). */
async function writeApp(name: string, content: string): Promise<void> {
  const dir = join(configDir(), "app");
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${name.replace(/^app\//, "")}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, content, { mode: 0o600 });
  await rename(tmp, join(configDir(), name));
}

export async function writeOffsite(value: StoredOffsite): Promise<void> {
  await writeApp(OFFSITE, `${JSON.stringify(value)}\n`);
}

/* Lama simpan arsip (T-tsvf): app/retention.json dibaca backup.sh dengan aturan yang sama (display.ts). */

const days = (label: string, { min, max }: { min: number; max: number }) =>
  z.coerce
    .number({ message: `${label} harus angka hari.` })
    .int(`${label} harus bilangan bulat (hari).`)
    .min(min, `${label} minimal ${min} hari.`)
    .max(max, `${label} maksimal ${max} hari.`);

export const retentionSchema = z.object({
  localDays: days("Lama simpan di server", RETENTION_LIMITS.localDays),
  remoteDays: days("Lama simpan di NAS", RETENTION_LIMITS.remoteDays),
});

export function parseRetention(
  raw: unknown,
):
  | { ok: true; data: z.infer<typeof retentionSchema> }
  | { ok: false; field?: RetentionField; message: string } {
  // String kosong bukan 0 hari: z.coerce mengubah "" menjadi 0 → pesan "minimal", jadi ditolak lebih dulu.
  const r = retentionSchema.safeParse(
    raw && typeof raw === "object"
      ? Object.fromEntries(
          Object.entries(raw).map(([k, v]) => [k, typeof v === "string" && !v.trim() ? NaN : v]),
        )
      : raw,
  );
  if (r.success) return { ok: true, data: r.data };
  const issue = r.error.issues[0];
  const field = issue?.path[0];
  return {
    ok: false,
    field: field === "localDays" || field === "remoteDays" ? field : undefined,
    message: issue?.message ?? "Isian tidak valid.",
  };
}

const storedRetentionSchema = z.object({
  localDays: z.number().int(),
  remoteDays: z.number().int(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});

export async function readRetention(): Promise<RetentionView | null> {
  const r = storedRetentionSchema.safeParse(await readJson(RETENTION));
  return r.success ? r.data : null;
}

export async function writeRetention(value: RetentionView): Promise<void> {
  await writeApp(RETENTION, `${JSON.stringify(value)}\n`);
}

/** Kembali ke bawaan server (.env.prod). */
export async function clearRetention(): Promise<void> {
  await rm(join(configDir(), RETENTION), { force: true });
}

/** "Kirim ulang sekarang": backup.sh --tick (cron tiap menit) hanya melihat keberadaan file ini. */
export async function writeSyncRequest(): Promise<void> {
  await writeApp(SYNC_REQUEST, `${new Date().toISOString()}\n`);
}

export async function syncRequested(): Promise<boolean> {
  try {
    await lstat(join(configDir(), SYNC_REQUEST));
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

const runSchema = z.object({ kind: z.enum(["backup", "sync"]), since: z.string() });

export async function readRunning(now = Date.now()): Promise<BackupRun | null> {
  const r = runSchema.safeParse(await readJson(RUNNING));
  if (!r.success) return null;
  const at = Date.parse(r.data.since);
  return Number.isFinite(at) && now - at < RUN_STALE_MS ? r.data : null;
}

const space = z.object({
  totalBytes: z.number().nonnegative(),
  freeBytes: z.number().nonnegative(),
});
const optional = <T extends z.ZodTypeAny>(t: T) => t.nullable().default(null).catch(null);

const statusSchema = z.object({
  state: z.enum(["ok", "pending", "failed", "off"]),
  target: z.string().nullable().default(null),
  pending: z.number().int().nonnegative().default(0),
  pendingSince: z.string().nullable().default(null),
  lastBackupAt: z.string().nullable().default(null),
  lastBackupOk: z.boolean().nullable().default(null),
  lastArchive: z.string().nullable().default(null),
  lastSizeBytes: z.number().nullable().default(null),
  lastOffsiteOkAt: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  updatedAt: z.string(),
  // T-tsvf: status lama tanpa field ini (atau isi yang tidak dikenal) tetap terbaca.
  syncFailures: z.number().int().nonnegative().default(0).catch(0),
  nextSyncAt: optional(z.string()),
  lastRequestAt: optional(z.string()),
  retention: optional(
    z.object({
      localDays: z.number().int(),
      remoteDays: z.number().int(),
      source: z.enum(["app", "env"]),
    }),
  ),
  archives: z
    .array(z.object({ name: z.string(), sizeBytes: z.number(), offsite: z.boolean() }))
    .default([])
    .catch([]),
  localBytes: optional(z.number()),
  disk: optional(space),
  remote: optional(
    z.object({
      target: z.string(),
      count: z.number().int(),
      bytes: z.number(),
      oldest: z.string().nullable(),
      newest: z.string().nullable(),
      checkedAt: z.string(),
    }),
  ),
  nasSpace: optional(space.extend({ target: z.string(), checkedAt: z.string() })),
});

export async function readStatus(): Promise<BackupStatus | null> {
  const r = statusSchema.safeParse(await readJson(STATUS));
  return r.success ? r.data : null;
}

/** Yang perlu diketahui admin sekarang; status belum ada (belum pernah backup sejak fitur ini) → null. */
export function backupAlert(s: BackupStatus | null, now = Date.now()): BackupAlert | null {
  if (!s) return null;
  if (s.state === "failed") {
    return {
      tone: "error",
      text:
        s.lastBackupOk === false
          ? "Backup terakhir gagal."
          : "Salinan backup off-VM tidak bisa dijalankan. Periksa pengaturan backup.",
    };
  }
  if (s.lastBackupAt && now - Date.parse(s.lastBackupAt) > STALE_MS) {
    return { tone: "error", text: "Tidak ada backup baru lebih dari 26 jam." };
  }
  if (s.state === "pending") {
    return {
      tone: "warning",
      text: `Salinan backup off-VM tertunda: ${s.pending} arsip menunggu di server dan dikirim ulang otomatis.`,
    };
  }
  return null;
}
