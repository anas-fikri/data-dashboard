/** Kerangka halaman pemetaan selama isu dihitung ulang di server (tanpa layar kosong). */
export default function MappingLoading() {
  const bar = "animate-pulse rounded-md bg-muted motion-reduce:animate-none";
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true">
      <span className="sr-only">Memuat pemetaan kolom…</span>
      <div className="flex flex-col gap-2 border-b pb-5">
        <div className={`h-4 w-40 ${bar}`} />
        <div className={`h-7 w-56 ${bar}`} />
        <div className={`h-4 w-full max-w-xl ${bar}`} />
      </div>
      <div className={`h-20 ${bar}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`h-14 ${bar}`} />
        ))}
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className={`h-48 rounded-lg ${bar}`} />
      ))}
    </div>
  );
}
