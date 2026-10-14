"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { fmtPct } from "@/components/schema/labels";
import { MappingCastFields } from "./mapping-cast-fields";
import { sameCast } from "./mapping-model";
import type { CastChoice, MappingLowCast } from "./mapping-types";

/*
 * Kolom yang cocok tetapi banyak nilainya tidak lolos konversi ke tipe aktif (< 98 %). Pemilik boleh
 * mengganti tipe/format untuk versi ini; menyimpan = menerima bahwa nilai yang tidak cocok dikosongkan.
 * Label terlihat di semua lebar (baris ini jarang dan tidak membentuk tabel).
 */
export function MappingLowCastRow({
  id,
  row,
  name,
  original,
  base,
  value,
  disabled,
  onChange,
}: {
  id: string;
  row: MappingLowCast;
  /** Nama tampil kolom (nama aktif). */
  name: string;
  /** Judul di file baru. */
  original: string;
  base: CastChoice;
  value: CastChoice;
  disabled: boolean;
  onChange: (next: CastChoice) => void;
}) {
  const changed = !sameCast(value, base);
  return (
    <li
      data-testid="mapping-lowcast-row"
      data-pos={row.pos}
      className="flex flex-col gap-3 border-b px-5 py-4 last:border-b-0 @2xl:grid @2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] @2xl:items-start @2xl:gap-4"
    >
      <div className="min-w-0">
        <p className="font-medium [overflow-wrap:anywhere]">{name}</p>
        <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
          <IconAlertTriangle size={16} stroke={1.5} aria-hidden className="shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {row.approx ? "Sekitar " : "Hanya "}
            {/* pct = porsi 0–1 dibulatkan ke bawah (97,9 % tidak tampil "98%"). */}
            <span className="font-medium text-foreground tabular-nums">{fmtPct(row.pct)}</span>{" "}
            nilai “{original}” cocok dengan {row.typeLabel}
            {changed ? <span className="font-medium text-primary"> · diubah</span> : null}
          </span>
        </p>
      </div>
      <MappingCastFields
        id={id}
        name={name}
        base={base}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    </li>
  );
}
