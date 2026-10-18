import { join } from "node:path";
import { env } from "./env";

/**
 * Volume bersama app ↔ service backup (T-7psf, T-byys): app menulis app/offsite.json dan app/smtp.json,
 * service backup menulis status.json. Dev tanpa volume: .cache/backup-config di folder proyek.
 * turbopackIgnore: jalur runtime, bukan aset build — tanpa ini seluruh proyek ikut di-trace ke standalone.
 */
export const sharedConfigDir = (): string =>
  env().BACKUP_CONFIG_DIR ??
  join(/* turbopackIgnore: true */ process.cwd(), ".cache", "backup-config");
