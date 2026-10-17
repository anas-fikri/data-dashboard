/**
 * Kerangka daftar panduan selama data dimuat di server (loading.tsx /panduan dan /admin/panduan,
 * T-0vjt): kepala halaman + blok kartu/baris, tanpa layar kosong.
 */
export function GuideSkeleton({ label, eyebrow = false }: { label: string; eyebrow?: boolean }) {
  const bar = "animate-pulse rounded-md bg-muted motion-reduce:animate-none";
  return (
    // Tanpa aria-busy permanen: pembaca layar bisa menahan pengumuman "Memuat…" (review T-0vjt).
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-2 border-b pb-5">
        {eyebrow ? <div className={`h-4 w-16 ${bar}`} /> : null}
        <div className={`h-8 w-56 max-w-full ${bar}`} />
        <div className={`h-4 w-full max-w-md ${bar}`} />
      </div>
      <div className="flex max-w-3xl flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={`h-28 rounded-lg ${bar}`} />
        ))}
      </div>
    </div>
  );
}
