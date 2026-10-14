import { IconCircleOff } from "@tabler/icons-react";
import { absentText } from "./body-state";

/*
 * Kolom yang dipakai widget ini kosong di versi data aktif (T-014: tidak ada di file baru dan
 * pemilik memilih "kosongkan" saat pemetaan). Catatan redup di bawah isi, bukan galat: widget tetap
 * jalan, nilainya memang kosong. Ikon + teks (status tidak lewat warna saja).
 */
export function AbsentNote({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return (
    <p
      className="flex shrink-0 items-start gap-1 border-t px-2 py-1 text-xs text-muted-foreground"
      data-testid="widget-absent-note"
    >
      <IconCircleOff size={14} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{absentText(names)}</span>
    </p>
  );
}
