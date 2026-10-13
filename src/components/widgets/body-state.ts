/*
 * Status isi widget yang perlu diketahui kepala kartu (T-011): tombol data grafik hanya berguna bila
 * grafik punya baris. Dipakai WidgetBody (memilih tampilan) dan kartu (tombol), jadi keduanya selalu
 * sepakat. Murni.
 */
import type { WidgetQueryState } from "./widget-query";

/** memuat = kerangka; rows = data berbaris tampil; none = pesan galat atau "tidak ada data". */
export type BodyState = "loading" | "rows" | "none";

/** Tabel tetap menampilkan data lama di bawah pesan galat (pindah halaman/urutan gagal). */
export function bodyState(state: WidgetQueryState, table: boolean): BodyState {
  if (state.status === "error" && !(state.data && table)) return "none";
  if (!state.data) return "loading";
  return state.data.rows.length > 0 ? "rows" : "none";
}

/**
 * Kunci isi widget: berubah setiap spec disimpan → isi dimuat ulang dan status lama tidak dipakai.
 * Sakelar filter silang (T-012) tidak mengubah data, jadi tidak ikut (tidak memuat ulang).
 */
export const configVersion = (config: { type: string; spec: unknown }) => {
  const spec =
    config.spec && typeof config.spec === "object" && "crossFilter" in config.spec
      ? { ...config.spec, crossFilter: undefined }
      : config.spec;
  return `${config.type}:${JSON.stringify(spec)}`;
};
