import { MarkWhatsNewSeen } from "@/components/shell/whats-new";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { WHATS_NEW } from "@/features/whats-new/entries";

export const metadata = { title: "Yang baru" };

const dateText = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** Daftar perubahan aplikasi dalam bahasa sederhana (v1.10.0); terbaru di atas. */
export default async function Page() {
  await requireUser();
  return (
    <div className="flex flex-col gap-6">
      <MarkWhatsNewSeen />
      <PageHeader
        title="Yang baru"
        description="Perubahan Data Dashboard dalam bahasa sederhana. Yang terbaru paling atas."
      />
      <ol className="flex max-w-3xl flex-col gap-6" data-testid="whats-new-list">
        {WHATS_NEW.map((e) => (
          <li key={e.version} className="flex flex-col gap-2 border-b pb-5 last:border-b-0">
            <h2 className="text-base font-semibold">
              Versi {e.version}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                · {dateText(e.date)}
              </span>
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {e.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
