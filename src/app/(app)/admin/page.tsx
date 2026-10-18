import {
  IconBook2,
  IconChevronRight,
  IconCloudUpload,
  IconMail,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
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

/** Bagian admin. */
const SECTIONS: AdminSection[] = [
  {
    href: "/admin/pengguna",
    title: "Pengguna",
    description:
      "Tambah atau hapus akun, jadikan atau cabut admin, nonaktifkan akun, dan alihkan dataset milik pengguna nonaktif.",
    icon: IconUsers,
  },
  {
    href: "/admin/panduan",
    title: "Panduan",
    description: "Tulis, urutkan, dan terbitkan artikel panduan untuk tiap peran.",
    icon: IconBook2,
  },
  {
    href: "/admin/backup",
    title: "Backup",
    description: "Lihat status backup harian dan atur target salinan off-VM (S3).",
    icon: IconCloudUpload,
  },
  {
    href: "/admin/email",
    title: "Email (SMTP)",
    description: "Atur server pengirim email aplikasi dan kirim email uji.",
    icon: IconMail,
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
