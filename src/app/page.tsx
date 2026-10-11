import Link from "next/link";

/** Placeholder sampai fondasi UI (T-025) dan auth (T-002) tersedia. */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Data Dashboard</h1>
      <p className="mt-2 text-foreground/70">
        Pengganti dashboard Excel PCP Express. Aplikasi sedang dibangun.
      </p>
      <p className="mt-6">
        <Link href="/health" className="underline underline-offset-4">
          Lihat kesehatan sistem
        </Link>
      </p>
    </main>
  );
}
