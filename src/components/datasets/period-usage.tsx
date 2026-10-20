import { IconAlertTriangle } from "@tabler/icons-react";
import {
  capacityMeterLine,
  capacityProjectionText,
  type PeriodCapacity,
  type UploadEstimate,
} from "@/features/ingest/period-capacity";
import type { PeriodPlan } from "@/features/ingest/period-plan";
import { cn } from "@/lib/utils";

/*
 * Meter pemakaian batas periode (rencana G-6 §5.4): dipakai "Tinjau" Atur periode (T-051) dan layar
 * tinjauan unggahan periode (T-054). Angka selalu tertulis; batang hanya penguat visual (aria-hidden),
 * "mendekati batas" ditulis, bukan hanya lewat warna.
 */

type Usage = PeriodPlan["usage"][number];

const fmt = (n: number) => n.toLocaleString("id-ID");
const gb = (n: number) =>
  `${(n / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 1 })} GB`;

export const LIMIT_TEXT: Record<Usage["limit"], string> = {
  periods: "batas simpan periode",
  sheetRows: "batas baris per sheet",
  datasetBytes: "batas ukuran dataset",
  sheetSegments: "batas periode per sheet",
};

export function usageText(u: Usage, sheet: string | null): string {
  switch (u.limit) {
    case "periods":
      return `${fmt(u.used)} dari ${fmt(u.max)} periode disimpan`;
    case "sheetRows":
      return `${fmt(u.used)} dari ${fmt(u.max)} baris per sheet${sheet ? ` (sheet “${sheet}”)` : ""}`;
    case "datasetBytes":
      return `${gb(u.used)} dari ${gb(u.max)} per dataset`;
    case "sheetSegments":
      return `${fmt(u.used)} dari ${fmt(u.max)} periode per sheet`;
  }
}

/** Daftar meter; `sheetName` = nama sheet untuk kunci lineageId (null = jangan sebut sheet). */
export function PeriodUsage({
  usage,
  sheetName,
}: {
  usage: Usage[];
  sheetName: (lineageId: string) => string | null;
}) {
  return (
    <ul className="flex flex-col gap-2" data-testid="period-usage">
      {usage.map((u) => {
        const pct = u.max > 0 ? Math.min(100, Math.round((u.used * 100) / u.max)) : 0;
        return (
          <li key={u.limit} className="flex flex-col gap-1 text-sm">
            <span className={cn(u.warn && "font-medium")}>
              {usageText(u, u.sheet ? sheetName(u.sheet) : null)}
              {u.warn ? " · mendekati batas" : ""}
            </span>
            <span aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full", u.warn ? "bg-warning" : "bg-primary")}
                style={{ width: `${pct}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Meter + proyeksi kapasitas data aktif (T-055, §5.4) untuk kartu Periode dan panel unggah. Hanya tampil
 * bila ada batas yang pemakaiannya ≥ PERIOD_WARN_PCT; angka tertulis (bukan hanya warna).
 */
export function PeriodCapacityNotice({
  capacity,
  testId,
}: {
  capacity: PeriodCapacity | null | undefined;
  testId: string;
}) {
  if (!capacity?.warn) return null;
  const projection = capacityProjectionText(capacity);
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/15 p-3 text-sm"
      data-testid={testId}
    >
      <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">Data periode mendekati batas penyimpanan</p>
        <p className="tabular-nums [overflow-wrap:anywhere]" data-testid="capacity-meter">
          {capacityMeterLine(capacity)}
        </p>
        {projection ? (
          <p className="text-muted-foreground" data-testid="capacity-projection">
            {projection}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Perkiraan dari ukuran file saat init (T-055): hanya peringatan, unggahan tetap berjalan. */
export function UploadEstimateNotice({ estimate }: { estimate: UploadEstimate | null }) {
  if (!estimate) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-sm",
        estimate.likely ? "border-warning/50 bg-warning/15" : "bg-muted/40",
      )}
      data-testid="upload-estimate"
    >
      <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
      <span className="[overflow-wrap:anywhere]">{estimate.message}</span>
    </p>
  );
}
