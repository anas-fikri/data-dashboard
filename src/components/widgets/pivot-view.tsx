"use client";

import { IconFilter } from "@tabler/icons-react";
import type { WidgetFilters } from "@/components/dashboards/filters/filter-context";
import { filterKey } from "@/components/dashboards/filters/filter-model";
import { crossFilterFor } from "@/components/dashboards/filters/filter-text";
import { Button } from "@/components/ui/button";
import type { PivotData } from "@/features/query/pivot";
import { pivotTable } from "@/features/widgets/pivot-table";
import type { NumberFormat } from "@/features/widgets/spec";
import { PivotFieldFilters } from "./pivot-filter-menu";
import { PivotTableMarkup, type PivotPicker } from "./pivot-markup";
import type { WidgetRequest } from "./widget-query";

/*
 * Widget pivot di kartu (T-tcjp): tabel pivot-markup.tsx dalam wilayah gulir yang bisa difokus
 * (keyboard); baris/kolom di luar batas tampilan disebut di catatan bawah. Di dashboard (T-f4a7):
 * menu saring per field di sel pojok, label baris/kolom menyaring widget lain (bila sakelarnya aktif
 * dan kolomnya termasuk kolom filter silang dashboard), dan catatan saringan yang berlaku + "Hapus
 * saringan".
 */
export function PivotView({
  data,
  format,
  label,
  request,
  cross,
  crossFilter = true,
}: {
  data: PivotData;
  format: NumberFormat;
  label: string;
  /** Permintaan kartu ini (menu saring memakai filter yang sama); tanpa ini tidak ada menu saring. */
  request?: WidgetRequest;
  cross?: WidgetFilters;
  /** Sakelar "Klik label menyaring widget lain" di pengaturan widget. */
  crossFilter?: boolean;
}) {
  const model = pivotTable(data);
  const edit = cross?.pivotEdit ?? null;
  const pick = cross?.pick;
  const picker: PivotPicker | undefined =
    pick && crossFilter
      ? (p) => {
          const f = model.fields.find((x) => x.role === p.field);
          if (!f || !cross.canPick(f.label)) return null;
          const filter = crossFilterFor(f.label, f.type, f.grain, p.raw);
          if (!filter) return null;
          const pressed = !!cross.selected && filterKey(cross.selected) === filterKey(filter);
          return { pressed, onPick: () => pick(filter) };
        }
      : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cincin fokus di pembungkus (di atas kepala yang menempel), pola tabel widget. */}
      <div className="relative flex min-h-0 flex-1 flex-col after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-sm after:ring-inset has-[[data-scroll]:focus-visible]:after:ring-2 has-[[data-scroll]:focus-visible]:after:ring-ring">
        <div
          data-scroll=""
          className="relative min-h-0 flex-1 overflow-auto focus-visible:outline-none"
          role="region"
          aria-label={label}
          // Wilayah gulir harus bisa difokus agar bisa digulir dengan keyboard (WCAG 2.1.1).
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          <PivotTableMarkup
            model={model}
            format={format}
            variant="screen"
            picker={picker}
            corner={
              edit && request ? (
                <PivotFieldFilters fields={model.fields} request={request} edit={edit} />
              ) : undefined
            }
          />
          {model.rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Tidak ada data untuk ditampilkan.
            </p>
          ) : null}
        </div>
      </div>
      {model.filterNote ? (
        <p
          className="flex flex-wrap items-center gap-x-2 border-t px-3 py-1 text-xs text-muted-foreground"
          data-testid="pivot-filter-note"
        >
          <IconFilter size={14} stroke={1.5} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{model.filterNote}</span>
          {edit?.current.length ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto min-h-6 px-0 text-xs"
              data-testid="pivot-filter-clear"
              onClick={edit.clear}
            >
              Hapus saringan
            </Button>
          ) : null}
        </p>
      ) : null}
      {model.note ? (
        <p className="border-t px-3 py-1 text-xs text-muted-foreground" data-testid="pivot-note">
          {model.note}
        </p>
      ) : null}
    </div>
  );
}
