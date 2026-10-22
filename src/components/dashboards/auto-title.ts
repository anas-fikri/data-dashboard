import { WIDGET_TITLE_MAX, normalizeName } from "@/features/dashboards/validation";
import { isCalcValue, parseWidgetConfig, type PivotSpec } from "@/features/widgets/spec";
import { dimensionText } from "./pivot-config-model";
import { measureText, type Source } from "./widget-config-model";

/*
 * Judul otomatis widget (T-12zs): judul turunan dari pengaturan, mis. "Total Omzet per Cabang",
 * "Total Omzet per Tanggal (per bulan)", "Jumlah baris". Selama judul widget kosong atau masih sama
 * dengan judul turunan pengaturan sebelumnya, judul mengikuti pengaturan; begitu pengguna mengetik
 * judul lain, judul itu dipertahankan (tanpa penanda di DB — perbandingan dengan judul turunan cukup).
 * Murni.
 */
type WidgetLike = {
  type: string;
  spec: unknown;
  /** Widget terikat pivot tersimpan (T-073): judulnya nama pivot tersimpan. */
  source?: { name: string };
};

const clip = (s: string) => {
  const t = normalizeName(s);
  return t.length <= WIDGET_TITLE_MAX ? t : `${t.slice(0, WIDGET_TITLE_MAX - 1).trimEnd()}…`;
};

/** Judul turunan; "" bila widget belum diatur atau pengaturannya tidak terbaca. */
export function autoTitle(w: WidgetLike, sources: Source[]): string {
  if (w.source) return clip(w.source.name);
  const parsed = parseWidgetConfig(w.type, w.spec);
  if (!parsed.ok || parsed.config.type === "empty") return "";
  const c = parsed.config;
  const sheet = sources.find((s) => s.id === c.spec.sheetId);
  const cols = sheet?.columns ?? [];
  const name = (pos: number) => cols.find((x) => x.pos === pos)?.name ?? "kolom";
  const value = (m: PivotSpec["values"][number]) =>
    isCalcValue(m) ? m.label : measureText(m, name);
  switch (c.type) {
    case "table":
      return sheet ? clip(`Data ${sheet.name}`) : "";
    case "kpi":
      return clip(value(c.spec.measure));
    case "pivot": {
      const [first, ...more] = c.spec.values;
      const values = more.length ? `${value(first!)} dan ${more.length} nilai lain` : value(first!);
      return clip(`${values} per ${dimensionText(c.spec.rows[0]!, cols)}`);
    }
    default:
      return clip(`${value(c.spec.measure)} per ${dimensionText(c.spec.dimension, cols)}`);
  }
}

/**
 * Judul baru setelah pengaturan widget berganti dari `before` ke `after`, atau null bila judul tidak
 * perlu diubah: judul sekarang diketik pengguna (bukan kosong dan bukan judul turunan sebelumnya), atau
 * judul turunan baru sama/kosong.
 */
export function followTitle(
  title: string,
  before: WidgetLike,
  after: WidgetLike,
  sources: Source[],
): string | null {
  const auto = title === "" || title === autoTitle(before, sources);
  if (!auto) return null;
  const next = autoTitle(after, sources);
  return next && next !== title ? next : null;
}
