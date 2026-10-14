/*
 * Status isi widget yang perlu diketahui kepala kartu (T-011): tombol data grafik hanya berguna bila
 * grafik punya baris. Dipakai WidgetBody (memilih tampilan) dan kartu (tombol), jadi keduanya selalu
 * sepakat. Plus teks catatan kolom kosong (T-014). Murni.
 */
import type { WidgetData, WidgetQueryState } from "./widget-query";

/** memuat = kerangka; rows = data berbaris tampil; none = pesan galat atau "tidak ada data". */
export type BodyState = "loading" | "rows" | "none";

/**
 * Tabel tetap menampilkan data lama di bawah pesan galat bila `keepOnError` — pindah halaman/urutan
 * gagal dengan filter yang sama (bukan data dari filter lain, T-012).
 */
export function bodyState(state: WidgetQueryState, keepOnError: boolean, chart = false): BodyState {
  if (state.status === "error" && !(state.data && keepOnError)) return "none";
  if (!state.data) return "loading";
  return (chart ? !chartEmpty(state.data) : state.data.rows.length > 0) ? "rows" : "none";
}

/**
 * Grafik tanpa nilai untuk digambar: tanpa baris, atau ada kolom kosong (absent, T-014) dan semua
 * ukurannya kosong/0 — batang/irisan nol semua menyesatkan, jadi "Tidak ada data" + catatan kolom.
 */
export function chartEmpty(data: Pick<WidgetData, "rows" | "absent">): boolean {
  if (data.rows.length === 0) return true;
  if (!data.absent?.length) return false;
  return data.rows.every((r) => r[1] === null || r[1] === undefined || Number(r[1]) === 0);
}

/** Catatan kolom kosong: "Kolom “A”, “B”, dan “C” kosong di versi data ini." */
export function absentText(names: string[]): string {
  const q = names.map((n) => `“${n}”`);
  const list =
    q.length <= 2 ? q.join(" dan ") : `${q.slice(0, -1).join(", ")}, dan ${q[q.length - 1]}`;
  return `Kolom ${list} kosong di versi data ini.`;
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
