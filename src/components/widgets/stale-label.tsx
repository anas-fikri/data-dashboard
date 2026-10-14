import { IconLoader2 } from "@tabler/icons-react";

/*
 * Penanda "Memperbarui…" di samping judul kartu (T-012): angka dari filter sebelumnya masih tampil
 * (kontras penuh) sementara data untuk filter baru dimuat lebih lama dari 0,4 s (widget-body.tsx).
 * Ikon selalu terlihat — juga di kartu < 12rem (mis. KPI w=2) dan di mode warna paksa (currentColor);
 * teksnya terlihat di kartu ≥ 12rem, di kartu lebih sempit hanya untuk pembaca layar. Pengecualian:
 * kartu < 5rem yang kepalanya memuat tombol data (44 px sentuh) — tidak ada ruang, dan tombol tidak
 * boleh terdorong keluar kartu; garis progres tetap menandai. Bukan wilayah live: bilah filter
 * mengumumkannya sekali untuk semua kartu ("Memperbarui 8 widget…").
 */
export function StaleLabel({ stale, title }: { stale: boolean; title: string }) {
  if (!stale) return null;
  return (
    <span
      data-testid="widget-stale"
      title="Memperbarui…"
      className="inline-flex min-w-3.5 shrink-[1000] items-center gap-1 text-xs whitespace-nowrap text-muted-foreground @max-[5rem]:[:has(>[data-testid=widget-data-toggle])>&]:sr-only"
    >
      <IconLoader2
        size={14}
        stroke={1.5}
        aria-hidden
        className="shrink-0 motion-safe:animate-spin"
      />
      <span className="sr-only @min-[12rem]:not-sr-only @min-[12rem]:min-w-0 @min-[12rem]:truncate">
        Memperbarui<span className="sr-only"> {title}</span>…
      </span>
    </span>
  );
}
