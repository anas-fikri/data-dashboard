"use client";

import { IconPalette } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
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
const SAVE_DELAY_MS = 350;

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
  // Simpan dengan jeda (geser pemilih warna = banyak perubahan), satu permintaan sekaligus, dan yang
  // terakhir dipilih yang tersimpan. Gagal → kembali ke nilai terakhir yang tersimpan di server.
  const confirmed = useRef(colors);
  const seq = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<{ n: number; next: WidgetColors | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const body = (next: WidgetColors | null) => JSON.stringify({ colors: next });
  const url = `/api/dashboards/${dashboardId}/colors`;

  const flush = () => {
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    chain.current = chain.current.then(async () => {
      let ok = false;
      try {
        const r = await fetch(url, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: body(job.next),
        });
        ok = r.ok;
      } catch {
        ok = false;
      }
      if (ok) confirmed.current = job.next;
      if (job.n !== seq.current) return; // pilihan lebih baru menyusul
      setSaving(false);
      if (!ok) {
        onSaved(confirmed.current);
        setError("Template warna belum tersimpan. Coba lagi.");
      }
    });
  };

  function change(next: WidgetColors | undefined) {
    const value = next ?? null;
    onSaved(value);
    setError(null);
    setSaving(true);
    pending.current = { n: ++seq.current, next: value };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }

  // Pindah halaman sebelum jeda habis: tetap terkirim (keepalive, tanpa menunggu jawaban).
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const job = pending.current;
      if (job) {
        void fetch(url, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: body(job.next),
          keepalive: true,
        }).catch(() => undefined);
      }
    },
    [url],
  );

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
          <ColorTemplateFields colors={colors ?? undefined} onChange={change} />
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
