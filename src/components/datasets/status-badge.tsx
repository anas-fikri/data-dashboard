import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconLoader2,
  IconRoute,
  IconUpload,
} from "@tabler/icons-react";
import type { DatasetLabel } from "@/features/datasets/label";
import { cn } from "@/lib/utils";

const pill =
  "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0";

/** Label profil (kosong/siap) + badge versi terbaru. Status tidak hanya warna: ikon + teks. */
export function StatusBadge({
  label,
  showMessage = false,
}: {
  label: DatasetLabel;
  showMessage?: boolean;
}) {
  const badge = label.badge;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-testid="dataset-status">
      {label.state === "siap" ? (
        <span className={cn(pill, "bg-success/12 text-success")}>
          <IconCircleCheck aria-hidden stroke={2} />
          Siap
        </span>
      ) : (
        <span className={cn(pill, "bg-muted text-muted-foreground")}>
          <IconCircleDashed aria-hidden stroke={2} />
          Kosong
        </span>
      )}
      {badge ? (
        <span
          data-badge={badge.kind}
          className={cn(
            pill,
            badge.kind === "failed" && "bg-destructive/12 text-destructive",
            badge.kind === "processing" && "bg-primary/12 text-primary",
            badge.kind === "uploading" && "bg-primary/12 text-primary",
            badge.kind === "awaiting_mapping" && "bg-warning/20 text-foreground",
          )}
        >
          {badge.kind === "failed" ? <IconAlertTriangle aria-hidden stroke={2} /> : null}
          {badge.kind === "processing" ? (
            <IconLoader2 aria-hidden stroke={2} className="motion-safe:animate-spin" />
          ) : null}
          {badge.kind === "uploading" ? <IconUpload aria-hidden stroke={2} /> : null}
          {badge.kind === "awaiting_mapping" ? <IconRoute aria-hidden stroke={2} /> : null}
          {badge.text}
        </span>
      ) : null}
      {showMessage && badge?.message ? (
        <span className="w-full text-sm text-destructive" data-testid="dataset-status-message">
          {badge.message}
        </span>
      ) : null}
    </span>
  );
}
