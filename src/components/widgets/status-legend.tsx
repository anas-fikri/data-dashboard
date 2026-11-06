import {
  STATUSES,
  STATUS_LABEL,
  TONE_LABEL,
  statusCssVars,
  statusPalette,
} from "@/features/widgets/status-color";
import type { Tone, WidgetColors } from "@/features/widgets/tone";
import { cn } from "@/lib/utils";

/*
 * Legenda warna status (v1.7.0) di bawah pivot/grafik: arti tiap warna dan arah tiap nilai, agar
 * pengguna tidak menebak ("Klaim: makin tinggi makin buruk"). Kotak warna memakai data-status yang
 * sama dengan sel (terang/gelap dari globals.css). Tidak tampil bila tidak ada nilai berarah.
 */
export function StatusLegend({
  colors,
  items,
  variant = "screen",
}: {
  colors?: WidgetColors;
  /** Nilai berarah: label nilai + arahnya. */
  items: { label: string; tone: Tone | undefined }[];
  variant?: "screen" | "print";
}) {
  const toned = items.filter((i): i is { label: string; tone: Tone } => !!i.tone);
  if (!toned.length) return null;
  const names = statusPalette(colors, false).names;
  return (
    <div
      data-testid="status-legend"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground",
        variant === "print" ? "px-1 pt-1 text-[10px]" : "border-t px-3 py-1.5 text-xs",
      )}
      style={statusCssVars(colors) as React.CSSProperties}
    >
      {STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span
            aria-hidden
            data-status={s}
            className="inline-block size-3 rounded-sm border border-black/10"
          />
          <span>
            {STATUS_LABEL[s]}
            <span className="sr-only"> ({names[s]})</span>
          </span>
        </span>
      ))}
      <span>
        {toned.map((i) => `${i.label}: ${TONE_LABEL[i.tone].toLowerCase()}`).join(" · ")} —
        dibanding nilai lain di widget ini
      </span>
    </div>
  );
}
