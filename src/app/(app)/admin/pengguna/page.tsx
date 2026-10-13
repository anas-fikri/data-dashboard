import { IconFileSearch, IconUserSearch, IconUsers } from "@tabler/icons-react";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFeedback } from "@/components/admin/admin-feedback";
import { AdminCrumb } from "@/components/admin/admin-crumb";
import { UsersPagination, usersHref } from "@/components/admin/users-pagination";
import { UsersSearch } from "@/components/admin/users-search";
import { UsersSkeleton } from "@/components/admin/users-skeleton";
import { UsersTable } from "@/components/admin/users-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listTransferTargets, listUsers } from "@/features/admin/service";
import { requireAdmin } from "@/features/auth/session";

export const metadata = { title: "Pengguna · Admin" };

type Search = Promise<{ q?: string | string[]; page?: string | string[] }>;

const Q_MAX = 100;

function toPage(raw: string | string[] | undefined): number {
  const n = Number.parseInt(typeof raw === "string" ? raw : "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Search }) {
  // Guard sebelum Suspense: non-admin mendapat 404 sungguhan (status dikirim sebelum streaming, D2).
  const me = await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, Q_MAX) : "";
  const page = toPage(params.page);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<AdminCrumb />}
        title="Pengguna"
        description="Atur peran admin, status akun, dan pemilik dataset pengguna nonaktif."
      />
      <div className="flex flex-col gap-4">
        <UsersSearch q={q} />
        <Suspense fallback={<UsersSkeleton />}>
          <UsersSection q={q} page={page} currentUserId={me.id} />
        </Suspense>
      </div>
    </div>
  );
}

async function UsersSection({
  q,
  page,
  currentUserId,
}: {
  q: string;
  page: number;
  currentUserId: string;
}) {
  const result = await listUsers({ q: q || undefined, page });
  const { users, total, pageSize } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Sumber selalu nonaktif, sedangkan target selalu aktif: satu daftar berlaku untuk semua sumber.
  const source = users.find((u) => !u.isActive && u.datasetCount > 0);
  const targets = source ? await listTransferTargets(source.id) : [];

  if (users.length === 0) return <UsersEmpty q={q} total={total} />;

  const from = (result.page - 1) * pageSize + 1;
  const to = from + users.length - 1;
  const count = total.toLocaleString("id-ID");
  const summary =
    (q ? `${count} pengguna cocok dengan “${q}”` : `${count} pengguna`) +
    (totalPages > 1 ? ` · menampilkan ${from}–${to}` : "");

  return (
    <>
      <p role="status" className="text-sm text-muted-foreground">
        {summary}
      </p>
      {/* key: pemberitahuan hasil aksi tidak terbawa ke halaman/pencarian lain. */}
      <AdminFeedback key={`${q}:${result.page}`}>
        <UsersTable
          users={users}
          currentUserId={currentUserId}
          targets={targets}
          caption={`Daftar pengguna, halaman ${result.page} dari ${totalPages}`}
        />
      </AdminFeedback>
      <UsersPagination q={q} page={result.page} totalPages={totalPages} />
    </>
  );
}

function UsersEmpty({ q, total }: { q: string; total: number }) {
  if (total > 0) {
    // Cadangan: service sudah menjepit nomor halaman ke halaman terakhir.
    return (
      <EmptyState
        icon={<IconFileSearch />}
        title="Halaman ini kosong"
        description="Daftar pengguna berubah sejak tautan ini dibuat."
        action={
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={usersHref(q, 1)}>Ke halaman pertama</Link>
          </Button>
        }
      />
    );
  }
  if (q) {
    return (
      <EmptyState
        icon={<IconUserSearch />}
        title="Tidak ada pengguna yang cocok"
        // "Hapus pencarian" sudah ada di bilah pencarian; tidak diulang di sini.
        description={`Tidak ada email atau nama yang mengandung “${q}”. Periksa ejaannya atau cari dengan kata lain.`}
      />
    );
  }
  return (
    <EmptyState
      icon={<IconUsers />}
      title="Belum ada pengguna"
      description="Pengguna muncul di sini setelah mendaftar dengan email perusahaan."
    />
  );
}
