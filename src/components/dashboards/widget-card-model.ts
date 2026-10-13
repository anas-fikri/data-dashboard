/*
 * Logika murni kartu widget (T-011): spec → isi kartu, dan tooltip/ikon tombol data grafik di kepala
 * kartu. Dipisah dari widget-card.tsx agar bisa diuji tanpa DOM.
 */
import { IconChartBar, IconChartLine, IconChartPie, IconTable } from "@tabler/icons-react";
import { parseWidgetConfig, type ChartType, type WidgetConfig } from "@/features/widgets/spec";

export type CardConfig = Exclude<WidgetConfig, { type: "empty" }>;

/**
 * Spec widget → isi kartu; null = belum diatur atau tidak valid. Spec yang dipetakan ke data terbaru
 * dengan kolom hilang (MISSING_COLUMN) tetap valid: kartu memuat data dan menampilkan pesan
 * COLUMN_UNAVAILABLE dari server, bukan "Widget ini belum berisi data.".
 */
export function cardConfig(type: unknown, spec: unknown): CardConfig | null {
  const parsed = parseWidgetConfig(type, spec);
  return parsed.ok && parsed.config.type !== "empty" ? parsed.config : null;
}

const CHART_ICON = { bar: IconChartBar, line: IconChartLine, pie: IconChartPie } as const;

/**
 * Tombol data grafik: tooltip dan ikon menunjuk tampilan tujuan (tabel ↔ grafik). Label aksesibel
 * tetap sama dan status dibawa aria-pressed (pola tombol toggle WAI-ARIA: label tidak berubah).
 */
export function dataToggle(chart: ChartType, showData: boolean) {
  return showData
    ? { tooltip: "Tampilkan grafik", Icon: CHART_ICON[chart] }
    : { tooltip: "Tampilkan tabel data", Icon: IconTable };
}
