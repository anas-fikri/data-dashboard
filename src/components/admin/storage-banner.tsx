import { IconDatabaseExclamation } from "@tabler/icons-react";
import type { IntegrityAlert } from "@/features/versions/integrity-status";

/** Pemberitahuan untuk admin di atas setiap halaman: pemeriksaan malam menemukan file data hilang (T-038). */
export function StorageBanner({ alert }: { alert: IntegrityAlert }) {
  return (
    <div
      role="status"
      data-testid="storage-alert"
      className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <IconDatabaseExclamation size={20} stroke={1.5} aria-hidden className="shrink-0" />
      <span>{alert.text}</span>
    </div>
  );
}
