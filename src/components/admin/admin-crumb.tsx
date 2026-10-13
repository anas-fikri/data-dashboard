import Link from "next/link";

/** Eyebrow PageHeader halaman di bawah /admin (pola tautan induk seperti halaman dataset). */
export function AdminCrumb() {
  return (
    <Link
      href="/admin"
      className="inline-flex min-h-6 items-center underline-offset-4 hover:underline"
    >
      Admin
    </Link>
  );
}
