"use client";

import { IconCircleCheck, IconPinned, IconRestore } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { FilterColumnView } from "@/features/dashboards/service";
import { api } from "../dashboard-api";
import { useDashboardFilters } from "./filter-context";
import { isDefaultState, normName } from "./filter-model";

/*
 * Filter bawaan (T-vb7q). Semua peran: "Kembalikan filter bawaan" saat status berbeda dari bawaan.
 * Mode edit (pemilik/editor, `manage`): "Jadikan filter aktif sebagai bawaan" menyimpan filter kolom
 * yang sedang aktif sebagai bawaan setiap kolom filter (kolom tanpa filter aktif → tanpa bawaan; filter
 * silang dan saringan pivot tidak ikut). Disimpan lewat PATCH kolom filter yang sama, lalu refresh.
 */
export function DefaultFilters({
  manage,
}: {
  manage: { dashboardId: string; columns: FilterColumnView[] } | null;
}) {
  const router = useRouter();
  const { state, defaults, atDefaults, restoreDefaults } = useDashboardFilters();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const hasDefaults = defaults.filters.length > 0;
  // Filter kolom sama dengan bawaan tersimpan (filter silang/pivot tidak ikut): tidak ada yang disimpan.
  const same = isDefaultState({ filters: state.filters }, defaults);

  async function save() {
    if (!manage || pending) return;
    setPending(true);
    setResult(null);
    const r = await api.setFilterColumns(
      manage.dashboardId,
      manage.columns.map((c) => {
        const f = state.filters.find((x) => normName(x.column) === normName(c.column));
        return { sheet: c.sheet, column: c.column, ...(f ? { default: f } : {}) };
      }),
    );
    setPending(false);
    if (r.ok) {
      setResult({
        ok: true,
        message: state.filters.length
          ? "Filter bawaan tersimpan."
          : "Filter bawaan dihapus — dashboard dibuka tanpa filter.",
      });
      router.refresh();
    } else {
      setResult({ ok: false, message: r.message });
    }
  }

  if (!manage && (!hasDefaults || atDefaults)) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        {hasDefaults && !atDefaults ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-(--control-h-lg) self-start md:h-(--control-h-sm)"
            leadingIcon={<IconRestore aria-hidden />}
            data-testid="filter-restore-defaults"
            onClick={restoreDefaults}
          >
            Kembalikan filter bawaan
          </Button>
        ) : null}
        {manage ? (
          <Button
            variant="outline"
            size="sm"
            className="h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto"
            leadingIcon={<IconPinned aria-hidden />}
            pending={pending}
            aria-disabled={same || undefined}
            data-testid="filter-save-defaults"
            onClick={() => (same ? undefined : void save())}
          >
            {state.filters.length || !hasDefaults
              ? "Jadikan filter aktif sebagai bawaan"
              : "Hapus filter bawaan"}
          </Button>
        ) : null}
      </div>
      {manage ? (
        <p role="status" className="flex items-center gap-1.5 text-sm empty:sr-only">
          {result?.ok ? (
            <>
              <IconCircleCheck size={18} stroke={1.5} aria-hidden className="text-success" />
              {result.message}
            </>
          ) : null}
        </p>
      ) : null}
      {result && !result.ok ? <FormAlert tone="error">{result.message}</FormAlert> : null}
    </div>
  );
}
