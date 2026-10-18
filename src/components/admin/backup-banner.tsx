import { IconAlertTriangle } from "@tabler/icons-react";
import Link from "next/link";
import type { BackupAlert } from "@/features/backup/types";
import { cn } from "@/lib/utils";

/** Pemberitahuan untuk admin di atas setiap halaman selama backup bermasalah (T-7psf). */
export function BackupBanner({ alert }: { alert: BackupAlert }) {
  return (
    <div
      role="status"
      data-testid="backup-alert"
      data-tone={alert.tone}
      className={cn(
        "mb-6 flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:gap-3",
        alert.tone === "error"
          ? "border-destructive/40 bg-destructive/10"
          : "border-warning/60 bg-warning/10",
      )}
    >
      <span className="flex flex-1 items-start gap-2">
        <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="shrink-0" />
        <span>{alert.text}</span>
      </span>
      <Link
        href="/admin/backup"
        className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 md:min-h-6"
      >
        Lihat status backup
      </Link>
    </div>
  );
}
