"use client";

import { useId, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import type { KpiCompare, KpiReference } from "@/features/widgets/spec";
import { Choice, ColumnChoice } from "./config-fields";
import { parseNumberText } from "./status-fields";
import { GRAIN_LABEL, isTemporal, type SourceColumn } from "./widget-config-model";

/*
 * Pembanding KPI (T-43hv): angka = periode terakhir di data (setelah filter) dibandingkan periode
 * sebelumnya atau periode yang sama tahun lalu. Butuh kolom tanggal; periode bawaan Bulan.
 */
const AGAINST = [
  { value: "none", label: "Tanpa pembanding" },
  { value: "previous", label: "Periode sebelumnya" },
  { value: "year", label: "Periode sama tahun lalu" },
  { value: "measure", label: "Ukuran lain (persen dari …)" },
  { value: "target", label: "Target angka" },
] as const;
type Against = (typeof AGAINST)[number]["value"];
type ReferenceMeasure = Extract<KpiReference, { kind: "measure" }>["measure"];

export function KpiCompareFields({
  value,
  reference,
  columns,
  dateMeasure = false,
  blankColumns = [],
  onChange,
  onReference,
  renderMeasure,
  percent = false,
}: {
  /** Nilai tampil sebagai persen: target diketik dalam persen (98 = 98%), disimpan 0,98 (review M2). */
  percent?: boolean;
  value: KpiCompare | undefined;
  /** Pembanding selain periode (v1.21): ukuran lain atau target angka. */
  reference?: KpiReference;
  onReference?: (next: KpiReference | undefined) => void;
  /** Isian ukuran pembanding (sama dengan isian Nilai). */
  renderMeasure?: (m: ReferenceMeasure, onChange: (m: ReferenceMeasure) => void) => ReactNode;
  columns: SourceColumn[];
  /** Nilai = tanggal terkecil/terbesar: tanpa persen perubahan, pembanding ditolak server (review v1.15). */
  dateMeasure?: boolean;
  /** Kolom yang dihitung "Jumlah kosong" (T-bwza): baris kosong tidak punya tanggal → bukan kolom periode. */
  blankColumns?: number[];
  onChange: (next: KpiCompare | undefined) => void;
}) {
  const dates = columns.filter((c) => isTemporal(c.type) && !blankColumns.includes(c.pos));
  const blankPeriod = !!value && blankColumns.includes(value.column);
  const current: Against = reference ? reference.kind : (value?.against ?? "none");
  const periodOk = dates.length > 0 && !dateMeasure;
  const options = AGAINST.filter(
    (o) =>
      o.value === current ||
      (((o.value !== "previous" && o.value !== "year") || periodOk) &&
        ((o.value !== "measure" && o.value !== "target") || (!!onReference && !dateMeasure))),
  );
  if (!value && !reference && !onReference && (!dates.length || dateMeasure)) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="kpi-compare-none">
        {dateMeasure
          ? "Pembanding periode hanya untuk nilai angka (bukan tanggal terkecil/terbesar)."
          : columns.some((c) => isTemporal(c.type))
            ? "Pembanding periode butuh kolom tanggal lain selain kolom yang dihitung kosongnya."
            : "Pembanding periode butuh kolom tanggal di sheet ini."}
      </p>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Choice
        label="Pembanding"
        testId="config-kpi-compare"
        value={current}
        options={options}
        onChange={(against) => {
          // Satu simpanan per pilihan: onChange membuang pembanding lain (periode/ukuran/target) sekaligus.
          if (against === "none") return onChange(undefined);
          if (against === "measure" || against === "target") {
            return onReference?.(
              against === "measure"
                ? { kind: "measure", measure: { agg: "count" } }
                : { kind: "target", value: 0 },
            );
          }
          onChange(
            value ? { ...value, against } : { column: dates[0]!.pos, grain: "month", against },
          );
        }}
      />
      {reference?.kind === "measure" && renderMeasure ? (
        <div className="flex min-w-0 flex-col gap-3" data-testid="config-kpi-reference-measure">
          {renderMeasure(reference.measure, (measure) =>
            onReference?.({ kind: "measure", measure }),
          )}
          <p className="text-xs text-muted-foreground">
            Angka menampilkan persen nilai terhadap ukuran ini (sheet dan filter sama), mis. resi
            diterima dari semua resi.
          </p>
        </div>
      ) : null}
      {reference?.kind === "target" ? (
        <TargetInput
          key={reference.value}
          value={reference.value}
          scale={percent ? 100 : 1}
          onChange={(v) => onReference?.({ kind: "target", value: v })}
        />
      ) : null}
      {value && dateMeasure ? (
        <p className="text-xs text-destructive" role="alert" data-testid="kpi-compare-invalid">
          Pembanding hanya untuk nilai angka — pilih Tanpa pembanding atau ubah nilainya.
        </p>
      ) : null}
      {value ? (
        <>
          <ColumnChoice
            label="Kolom tanggal"
            testId="config-kpi-compare-column"
            value={value.column}
            columns={dates}
            // Kolom ada, tetapi kolom itu yang dihitung kosongnya (review T-bwza): pesan khusus, bukan
            // "tidak tersedia lagi".
            {...(blankPeriod
              ? {
                  invalidText:
                    "Kolom ini yang dihitung kosongnya (baris kosong tidak punya tanggal). Pilih kolom tanggal lain atau Tanpa pembanding.",
                }
              : {})}
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

/** Target angka (v1.21): disimpan saat keluar dari kotak; isian bukan angka ditandai, tidak disimpan. */
function TargetInput({
  value,
  scale,
  onChange,
}: {
  value: number;
  scale: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const shown = Math.round(value * scale * 1e9) / 1e9;
  const [text, setText] = useState(shown ? String(shown).replace(".", ",") : "");
  const parsed = parseNumberText(text);
  const bad = parsed === "bad";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Target
      </label>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        aria-invalid={bad || undefined}
        aria-describedby={`${id}-hint`}
        data-testid="config-kpi-target"
        placeholder="mis. 98 atau 1.000.000"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          // Tanpa perubahan → tanpa simpanan (review L2).
          if (typeof parsed === "number" && parsed !== shown) onChange(parsed / scale);
        }}
      />
      <p
        id={`${id}-hint`}
        className={bad ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      >
        {bad
          ? "Isi angka saja."
          : "Angka menampilkan persen pencapaian terhadap target. ▲/▼ hijau-merah mengikuti penilaian warna (bawaan: lebih tinggi lebih baik)."}
      </p>
    </div>
  );
}
