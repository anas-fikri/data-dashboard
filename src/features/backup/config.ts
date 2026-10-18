import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { env } from "@/lib/env";
import type { BackupAlert, BackupStatus, OffsiteField } from "./types";

/*
 * Target backup off-VM yang diisi admin (T-7psf) dan status dari service backup, di volume bersama
 * backup-config: app/offsite.json (600, ditulis app, dibaca deploy/backup.sh) dan status.json (ditulis
 * backup.sh; folder induk milik root sehingga app hanya bisa menulis di app/). Secret hanya ada di
 * offsite.json — tidak di DB (tidak ikut arsip backup) dan tidak di log.
 */

// turbopackIgnore: jalur runtime (dev), bukan aset build — tanpa ini seluruh proyek ikut di-trace ke standalone.
const configDir = () =>
  env().BACKUP_CONFIG_DIR ??
  join(/* turbopackIgnore: true */ process.cwd(), ".cache", "backup-config");
const OFFSITE = join("app", "offsite.json");
const STATUS = "status.json";
/** Backup harian yang lebih tua dari ini dianggap tidak berjalan (jadwal 24 jam + jeda durasi). */
export const STALE_MS = 26 * 60 * 60 * 1000;

function isEndpoint(v: string): boolean {
  try {
    const u = new URL(v);
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      !u.username &&
      !u.password &&
      (u.pathname === "/" || u.pathname === "") &&
      !u.search &&
      !u.hash
    );
  } catch {
    return false;
  }
}

/** Isian form; nilai dibatasi ASCII tercetak tanpa baris baru (dibaca jq lalu env rclone di backup.sh). */
export const offsiteSchema = z.object({
  enabled: z.boolean(),
  endpoint: z
    .string()
    .trim()
    .max(200)
    .regex(/^[\x21-\x7e]+$/, "Endpoint tidak boleh berisi spasi atau karakter khusus.")
    .refine(
      isEndpoint,
      "Endpoint harus alamat http:// atau https:// tanpa folder, mis. https://s3.contoh.lan:9000.",
    )
    .transform((v) => new URL(v).origin),
  bucket: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
      "Nama bucket 3–63 karakter: huruf kecil, angka, titik, atau tanda hubung.",
    ),
  prefix: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v.replace(/^\/+|\/+$/g, ""))
    .refine(
      (v) =>
        v === "" ||
        (/^[A-Za-z0-9._/-]+$/.test(v) &&
          !v.split("/").some((p) => p === "" || p === "." || p === "..")),
      "Folder hanya boleh huruf, angka, titik, garis bawah, tanda hubung, dan /.",
    ),
  region: z
    .string()
    .trim()
    .max(32)
    .regex(/^[a-z0-9-]*$/, "Region hanya huruf kecil, angka, dan tanda hubung.")
    .transform((v) => v || "us-east-1"),
  accessKeyId: z
    .string()
    .trim()
    .regex(/^[\x21-\x7e]{1,128}$/, "Access key 1–128 karakter tanpa spasi."),
  secretAccessKey: z
    .string()
    .max(256, "Secret key maksimal 256 karakter.")
    .regex(/^[\x20-\x7e]*$/, "Secret key hanya karakter ASCII tanpa baris baru."),
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
  secretAccessKey: z.string().min(1),
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
export async function writeOffsite(value: StoredOffsite): Promise<void> {
  const dir = join(configDir(), "app");
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.offsite.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(tmp, join(configDir(), OFFSITE));
}

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
