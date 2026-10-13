import { IconChevronRight, IconUsers, type Icon } from "@tabler/icons-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/session";

export const metadata = { title: "Admin" };

interface AdminSection {
  href: string;
  title: string;
  description: string;
  icon: Icon;
}

/** Bagian admin. Panduan (T-020) ditambahkan di sini. */
const SECTIONS: AdminSection[] = [
  {
    href: "/admin/pengguna",
    title: "Pengguna",
    description:
      "Jadikan atau cabut admin, nonaktifkan akun, dan alihkan dataset milik pengguna nonaktif.",
    icon: IconUsers,
  },
];

export default async function AdminPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Admin" description="Pengaturan yang hanya bisa dibuka admin." />
      <ul aria-label="Bagian admin" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map(({ href, title, description, icon: SectionIcon }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full items-start gap-3 rounded-lg border bg-card p-5 shadow-xs transition-colors hover:bg-accent/60"
            >
              <SectionIcon size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-tight">{title}</h2>
                <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
              </span>
              <IconChevronRight
                size={20}
                stroke={1.5}
                aria-hidden
                className="mt-0.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
