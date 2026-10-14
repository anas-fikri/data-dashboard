/*
 * Label "Memperbarui…" di samping judul kartu (T-012): angka dari filter sebelumnya masih tampil
 * (kontras penuh) sementara data untuk filter baru dimuat lebih lama dari 0,4 s (widget-body.tsx).
 * Terlihat di kartu ≥ 12rem; lebih sempit hanya untuk pembaca layar (garis progres tetap terlihat).
 * Wilayah status selalu terpasang (kosong saat tidak memuat), jadi munculnya diumumkan sekali, sopan.
 */
export function StaleLabel({ stale, title }: { stale: boolean; title: string }) {
  return (
    <span
      role="status"
      data-testid="widget-stale"
      className="sr-only shrink-0 text-xs whitespace-nowrap text-muted-foreground @min-[12rem]:not-sr-only"
    >
      {stale ? (
        <>
          Memperbarui<span className="sr-only"> {title}</span>…
        </>
      ) : null}
    </span>
  );
}
