"use client";

import { IconPalette } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DashboardColorsContext } from "@/components/widgets/dashboard-colors";
import { PALETTE_LABEL } from "@/features/widgets/status-color";
import {
  PALETTES,
  statusColorsOf,
  type DashboardColors,
  type Palette,
  type Tone,
  type WidgetColors,
} from "@/features/widgets/tone";
import { Choice } from "./config-fields";
import { ColorTemplateFields } from "./status-fields";

/*
 * "Warna dashboard": tema grafik (v1.10.0, warna seri semua Batang/Garis/Pai) dan template warna status
 * (v1.9.0) untuk seluruh dashboard. Widget yang tidak memilih template sendiri (bawaan "Ikuti
 * dashboard") langsung ikut — seragam tanpa mengatur widget satu per satu. Pemilik/editor, mode edit.
 */
const SAVE_DELAY_MS = 350;
// Kelas utuh (Tailwind tidak membaca nama kelas yang disusun saat runtime).
const SWATCHES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

export function DashboardColorsControl({
  dashboardId,
  colors,
  onSaved,
  className,
}: {
  dashboardId: string;
  colors: DashboardColors | null;
  onSaved: (colors: DashboardColors | null) => void;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Simpan dengan jeda (geser pemilih warna = banyak perubahan), satu permintaan sekaligus, dan yang
  // terakhir dipilih yang tersimpan. Gagal → kembali ke nilai terakhir yang tersimpan di server.
  const confirmed = useRef(colors);
  const seq = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<{ n: number; next: DashboardColors | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const body = (next: DashboardColors | null) => JSON.stringify({ colors: next });
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

  // Gabungan tema grafik + template status; semuanya bawaan → null (kolom kosong).
  const palette: Palette = colors?.palette ?? "default";
  const status = statusColorsOf(colors);
  const tone: Tone | undefined = colors?.tone;
  // Gabungan tema + template + penilaian bawaan; semuanya bawaan → null (kolom kosong).
  const merge = (next: {
    p?: Palette;
    st?: WidgetColors | undefined;
    t?: Tone | undefined;
  }): DashboardColors | null => {
    const p = "p" in next ? next.p! : palette;
    const st = "st" in next ? next.st : status;
    const t = "t" in next ? next.t : tone;
    const v: DashboardColors = {
      ...(st ?? {}),
      ...(p !== "default" ? { palette: p } : {}),
      ...(t ? { tone: t } : {}),
    };
    return Object.keys(v).length ? v : null;
  };

  function change(next: DashboardColors | null) {
    const value = next;
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
      <PopoverContent
        aria-label="Warna dashboard"
        data-testid="dashboard-colors-panel"
        className="grid gap-3"
      >
        <div className="grid gap-2">
          <Choice
            label="Tema grafik"
            testId="dashboard-palette"
            value={palette}
            options={PALETTES.map((p) => ({ value: p, label: PALETTE_LABEL[p] }))}
            onChange={(p) => change(merge({ p }))}
          />
          {/* Contoh 5 warna seri tema terpilih (warna sungguhan dari globals.css). */}
          <div
            className="flex gap-1"
            aria-hidden
            data-palette={palette === "default" ? undefined : palette}
            data-testid="dashboard-palette-preview"
          >
            {SWATCHES.map((c) => (
              <span key={c} className={`h-3 w-6 rounded-sm ${c}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Warna garis, batang, dan irisan pai di semua grafik dashboard ini.
          </p>
        </div>
        <div className="grid gap-2 border-t pt-3">
          {/* Di luar cakupan dashboard: tanpa pilihan "Ikuti dashboard"; Lembut = bawaan. */}
          <Choice
            label="Penilaian warna bawaan"
            testId="dashboard-tone"
            value={tone ?? "none"}
            options={[
              { value: "none", label: "Tanpa (atur per widget)" },
              { value: "up", label: "Makin tinggi makin baik (mis. tepat waktu)" },
              { value: "down", label: "Makin tinggi makin buruk (mis. klaim, retur)" },
            ]}
            onChange={(v) => change(merge({ t: v === "none" ? undefined : (v as Tone) }))}
          />
          <p className="text-xs text-muted-foreground" data-testid="dashboard-colors-hint">
            Warna status (hijau baik, merah perlu perhatian) untuk semua widget Batang, Garis, Pai,
            dan Pivot yang belum memilih <strong>Penilaian warna</strong> sendiri. Angka yang
            arahnya terbalik (mis. klaim) atau tidak perlu diwarnai: ubah di pengaturan widget itu.
            Tabel diwarnai per kolom di pengaturan Tabel; Angka hanya dengan batas angka.
          </p>
          <DashboardColorsContext.Provider value={null}>
            <ColorTemplateFields colors={status} onChange={(st) => change(merge({ st }))} />
          </DashboardColorsContext.Provider>
        </div>
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
