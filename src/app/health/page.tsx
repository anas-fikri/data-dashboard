import { cachedHealthReport, publicView } from "@/lib/health";
import { exposeHealthDetail, infraChecks } from "@/lib/health/checks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Kesehatan sistem" };

/**
 * Halaman status layanan untuk developer/operator.
 * Di produksi detail disembunyikan; jalur admin ditambahkan di T-027.
 */
export default async function HealthPage() {
  const report = publicView(await cachedHealthReport(infraChecks()), exposeHealthDetail());
  const allOk = report.status === "ok";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Kesehatan sistem</h1>
      <p className="mt-1 text-sm text-foreground/70">
        Diperiksa {new Date(report.checkedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}{" "}
        WIB
      </p>

      <p
        role="status"
        className="mt-6 rounded-md border border-foreground/15 px-4 py-3 font-medium"
        data-status={report.status}
      >
        {allOk ? "Semua layanan OK" : "Ada layanan yang bermasalah"}
      </p>

      <ul className="mt-6 divide-y divide-foreground/10 rounded-md border border-foreground/15">
        {report.items.map((item) => (
          <li
            key={item.name}
            data-check={item.name}
            data-status={item.status}
            className="flex items-start justify-between gap-4 px-4 py-3"
          >
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-foreground/70">{item.detail}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold uppercase">{item.status === "ok" ? "OK" : "Gagal"}</p>
              <p className="text-foreground/60">{item.latencyMs} ms</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
