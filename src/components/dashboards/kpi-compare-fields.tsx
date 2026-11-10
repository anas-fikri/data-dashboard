"use client";

import type { KpiCompare } from "@/features/widgets/spec";
import { Choice, ColumnChoice } from "./config-fields";
import { GRAIN_LABEL, isTemporal, type SourceColumn } from "./widget-config-model";

/*
 * Pembanding KPI (T-43hv): angka = periode terakhir di data (setelah filter) dibandingkan periode
 * sebelumnya atau periode yang sama tahun lalu. Butuh kolom tanggal; periode bawaan Bulan.
 */
const AGAINST = [
  { value: "none", label: "Tanpa pembanding" },
  { value: "previous", label: "Periode sebelumnya" },
  { value: "year", label: "Periode sama tahun lalu" },
] as const;

export function KpiCompareFields({
  value,
  columns,
  onChange,
}: {
  value: KpiCompare | undefined;
  columns: SourceColumn[];
  onChange: (next: KpiCompare | undefined) => void;
}) {
  const dates = columns.filter((c) => isTemporal(c.type));
  if (!value && !dates.length) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="kpi-compare-none">
        Pembanding periode butuh kolom tanggal di sheet ini.
      </p>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Choice
        label="Pembanding"
        testId="config-kpi-compare"
        value={value?.against ?? "none"}
        options={[...AGAINST]}
        onChange={(against) => {
          if (against === "none") return onChange(undefined);
          onChange(
            value ? { ...value, against } : { column: dates[0]!.pos, grain: "month", against },
          );
        }}
      />
      {value ? (
        <>
          <ColumnChoice
            label="Kolom tanggal"
            testId="config-kpi-compare-column"
            value={value.column}
            columns={dates}
            onChange={(column) => onChange({ ...value, column })}
          />
          <Choice
            label="Periode"
            testId="config-kpi-compare-grain"
            value={value.grain}
            options={Object.entries(GRAIN_LABEL).map(([v, label]) => ({
              value: v as KpiCompare["grain"],
              label,
            }))}
            onChange={(grain) => onChange({ ...value, grain })}
          />
          <p className="text-xs text-muted-foreground">
            Angka menampilkan {GRAIN_LABEL[value.grain].replace("Per ", "")} terakhir di data
            (setelah filter), dibandingkan dengan{" "}
            {value.against === "year" ? "periode yang sama tahun lalu" : "periode sebelumnya"}.
            Warna ▲/▼ mengikuti penilaian warna.
          </p>
        </>
      ) : null}
    </div>
  );
}
