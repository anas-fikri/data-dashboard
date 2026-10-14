import { IconAlertCircle, IconAlertTriangle } from "@tabler/icons-react";
import { fmtInt } from "@/components/schema/labels";
import { cn } from "@/lib/utils";
import type { MappingLast } from "./mapping-types";

const FAILED = "Periksa pilihan kolom, lalu simpan lagi.";

/** Isi pemberitahuan hasil terakhir job pemetaan yang tidak selesai; null = tidak perlu ditampilkan. */
export function lastOutcome(last: MappingLast): { title: string; text: string } | null {
  switch (last.state) {
    case "review":
      return {
        title: "Pemetaan terakhir perlu diperiksa",
        text: `Di ${fmtInt(last.issues?.length ?? 0)} kolom, banyak nilai tidak cocok dengan tipenya; belum ada yang disimpan. Buka pemetaan kolom, buat lagi pilihannya, lalu ubah tipenya atau simpan dan kosongkan nilai yang tidak cocok.`,
      };
    case "stale":
      return {
        title: "Pemetaan terakhir belum diterapkan",
        text: `Skema aktif berubah sebelum pemetaan selesai. ${FAILED}`,
      };
    case "invalid":
    case "failed":
      return { title: "Pemetaan terakhir belum diterapkan", text: last.message || FAILED };
    default:
      return null;
  }
}

/**
 * Hasil terakhir job pemetaan versi ini (dari server, mis. setelah meninggalkan halaman saat job
 * berjalan): tidak lagi hilang diam-diam. Tidak merebut fokus; ikon + teks, bukan warna saja.
 */
export function MappingLastNotice({ last }: { last: MappingLast }) {
  const out = lastOutcome(last);
  if (!out) return null;
  const review = last.state === "review";
  const Icon = review ? IconAlertTriangle : IconAlertCircle;
  return (
    <div
      // Muncul setelah render ulang (job selesai saat halaman terbuka): diumumkan sopan.
      role="status"
      data-testid="mapping-last"
      data-state={last.state}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        review ? "border-warning/60 bg-warning/10" : "border-destructive/40 bg-destructive/10",
      )}
    >
      <Icon
        size={20}
        stroke={1.5}
        aria-hidden
        className={cn("mt-px shrink-0", review ? "text-foreground" : "text-destructive")}
      />
      <p className="min-w-0 [overflow-wrap:anywhere]">
        <span className="block font-medium">{out.title}</span>
        <span className="block">{out.text}</span>
      </p>
    </div>
  );
}
