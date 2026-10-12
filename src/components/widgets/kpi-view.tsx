import { formatCell } from "@/features/widgets/format";
import type { NumberFormat } from "@/features/widgets/spec";
import type { WidgetData } from "./widget-query";

/** Satu angka besar (T-011): label ukuran + nilai terformat; ukuran huruf mengikuti lebar kartu. */
export function KpiView({ data, format }: { data: WidgetData; format: NumberFormat }) {
  const column = data.columns[0];
  const value = data.rows[0]?.[0] ?? null;
  // Jumlah baris/unik juga mengikuti format pilihan user (mis. persen tidak masuk akal → user memilih).
  const text = formatCell(
    value,
    column?.type === "count" ? "decimal" : (column?.type ?? "decimal"),
    format,
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-1 px-4 pb-4">
      <p className="text-sm text-muted-foreground">{column?.label}</p>
      <p
        className="break-words text-2xl font-semibold tabular-nums tracking-tight @xs:text-3xl @md:text-4xl"
        data-testid="kpi-value"
      >
        {text}
      </p>
    </div>
  );
}
