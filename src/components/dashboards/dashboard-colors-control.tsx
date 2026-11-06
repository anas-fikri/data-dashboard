"use client";

import { IconPalette } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DashboardColorsContext } from "@/components/widgets/dashboard-colors";
import type { WidgetColors } from "@/features/widgets/tone";
import { ColorTemplateFields } from "./status-fields";

/*
 * "Warna dashboard" (v1.9.0): satu template warna status untuk seluruh dashboard. Semua widget yang
 * tidak memilih template sendiri (bawaan "Ikuti dashboard") langsung ikut — seragam tanpa mengatur
 * widget satu per satu. Pemilik/editor, mode edit.
 */
export function DashboardColorsControl({
  dashboardId,
  colors,
  onSaved,
  className,
}: {
  dashboardId: string;
  colors: WidgetColors | null;
  onSaved: (colors: WidgetColors | null) => void;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save(next: WidgetColors | undefined) {
    const prev = colors;
    onSaved(next ?? null);
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/dashboards/${dashboardId}/colors`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ colors: next ?? null }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      onSaved(prev);
      setError("Template warna belum tersimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={className}
          leadingIcon={<IconPalette aria-hidden />}
          data-testid="dashboard-colors"
        >
          Warna dashboard
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Warna dashboard" data-testid="dashboard-colors-panel">
        <p className="text-sm">
          Template warna status untuk semua widget di dashboard ini. Widget yang memilih template
          sendiri tetap memakai pilihannya.
        </p>
        {/* Di luar cakupan dashboard: tanpa pilihan "Ikuti dashboard"; Lembut = bawaan (null). */}
        <DashboardColorsContext.Provider value={null}>
          <ColorTemplateFields colors={colors ?? undefined} onChange={(c) => void save(c)} />
        </DashboardColorsContext.Provider>
        <p
          className={error ? "text-sm text-destructive" : "text-xs text-muted-foreground"}
          role={error ? "alert" : "status"}
          data-testid="dashboard-colors-status"
        >
          {error ?? (saving ? "Menyimpan…" : "Tersimpan otomatis.")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
