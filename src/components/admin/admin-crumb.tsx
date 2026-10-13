import Link from "next/link";

/**
 * Eyebrow PageHeader halaman di bawah /admin (pola tautan induk seperti halaman dataset). Target
 * sentuh 44 px di ponsel, 24 px mulai 768 (WCAG 2.5.8 minimum).
 */
export function AdminCrumb() {
  return (
    <Link
      href="/admin"
      className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:underline md:min-h-6 md:min-w-0"
    >
      Admin
    </Link>
  );
}
