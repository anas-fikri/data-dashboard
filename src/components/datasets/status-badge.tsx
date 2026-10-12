import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconLoader2,
  IconRoute,
  IconPlayerPause,
} from "@tabler/icons-react";
import type { DatasetLabel } from "@/features/datasets/label";
import { cn } from "@/lib/utils";

/*
 * Teks badge selalu text-foreground (kontras ≥ 4.5:1 di kedua tema); warna status dibawa ikon dan
 * latar tipis (review desain T-003 #3). Status tidak hanya lewat warna: ikon + teks.
 */
const pill =
  "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0";

export function StatusBadge({ label }: { label: DatasetLabel }) {
  const badge = label.badge;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-testid="dataset-status">
      {label.state === "siap" ? (
        <span className={cn(pill, "bg-success/12")}>
          <IconCircleCheck aria-hidden stroke={2} className="text-success" />
          Siap
        </span>
      ) : (
        <span className={cn(pill, "bg-muted")}>
          <IconCircleDashed aria-hidden stroke={2} className="text-muted-foreground" />
          Kosong
        </span>
      )}
      {badge ? (
        <span
          data-badge={badge.kind}
          className={cn(
            pill,
            badge.kind === "failed" && "bg-destructive/12",
            badge.kind === "processing" && "bg-primary/12",
            badge.kind === "uploading" && "bg-muted",
            badge.kind === "awaiting_mapping" && "bg-warning/20",
          )}
        >
          {badge.kind === "failed" ? (
            <IconAlertTriangle aria-hidden stroke={2} className="text-destructive" />
          ) : null}
          {badge.kind === "processing" ? (
            <IconLoader2 aria-hidden stroke={2} className="text-primary motion-safe:animate-spin" />
          ) : null}
          {badge.kind === "uploading" ? (
            <IconPlayerPause aria-hidden stroke={2} className="text-muted-foreground" />
          ) : null}
          {badge.kind === "awaiting_mapping" ? <IconRoute aria-hidden stroke={2} /> : null}
          {badge.text}
        </span>
      ) : null}
    </span>
  );
}
