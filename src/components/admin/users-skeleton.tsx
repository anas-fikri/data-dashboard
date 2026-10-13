const BAR = "rounded-sm bg-muted motion-safe:animate-pulse";

/** Kerangka daftar pengguna selama data dimuat (bentuk sama dengan baris kartu/tabel). */
export function UsersSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        Memuat daftar pengguna…
      </p>
      <div aria-hidden className={`h-4 w-40 ${BAR}`} />
      <div aria-hidden className="overflow-hidden rounded-lg border bg-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className={`h-4 w-full max-w-64 ${BAR}`} />
              <div className={`h-3 w-32 ${BAR}`} />
            </div>
            <div className={`hidden h-6 w-20 rounded-full sm:block ${BAR}`} />
            <div className={`hidden h-6 w-16 rounded-full md:block ${BAR}`} />
            <div className={`size-(--control-h-lg) md:size-(--control-h) ${BAR}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
