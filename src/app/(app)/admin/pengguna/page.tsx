import { IconFileSearch, IconUserSearch, IconUsers } from "@tabler/icons-react";
import Link from "next/link";
import { Suspense } from "react";
import { AddUserDialog } from "@/components/admin/add-user-dialog";
import { AdminFeedback } from "@/components/admin/admin-feedback";
import { AdminCrumb } from "@/components/admin/admin-crumb";
import { UsersPagination } from "@/components/admin/users-pagination";
import { UsersSearch } from "@/components/admin/users-search";
import { UsersSkeleton } from "@/components/admin/users-skeleton";
import { UsersTable } from "@/components/admin/users-table";
import { STATUS_LABEL, usersHref } from "@/components/admin/users-url";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listUsers, parseUserStatus } from "@/features/admin/service";
import type { UserStatusFilter } from "@/features/admin/types";
import { requireAdmin } from "@/features/auth/session";

export const metadata = { title: "Pengguna · Admin" };

type Search = Promise<{
  q?: string | string[];
  page?: string | string[];
  status?: string | string[];
}>;

const Q_MAX = 100;

function toPage(raw: string | string[] | undefined): number {
  const n = Number.parseInt(typeof raw === "string" ? raw : "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** "pengguna nonaktif", "pengguna belum verifikasi"; tanpa saringan cukup "pengguna". */
function whoLabel(status: UserStatusFilter): string {
  return status === "all" ? "pengguna" : `pengguna ${STATUS_LABEL[status].toLowerCase()}`;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Search }) {
  // Guard sebelum Suspense: non-admin mendapat 404 sungguhan (status dikirim sebelum streaming, D2).
  const me = await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, Q_MAX) : "";
  const page = toPage(params.page);
  const status = parseUserStatus(params.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<AdminCrumb />}
        title="Pengguna"
        description="Tambah atau hapus akun, atur peran admin dan status akun, serta alihkan dataset pengguna nonaktif."
        actions={<AddUserDialog />}
      />
      <div className="flex flex-col gap-4">
        <UsersSearch q={q} status={status} />
        {/* key: ganti saringan/halaman lewat navigasi klien tetap menampilkan kerangka muat. */}
        <Suspense key={`${q}|${status}|${page}`} fallback={<UsersSkeleton />}>
          <UsersSection q={q} status={status} page={page} currentUserId={me.id} />
        </Suspense>
      </div>
    </div>
  );
}

async function UsersSection({
  q,
  status,
  page,
  currentUserId,
}: {
  q: string;
  status: UserStatusFilter;
  page: number;
  currentUserId: string;
}) {
  const result = await listUsers({ q: q || undefined, page, status });
  const { users, total, pageSize } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (users.length === 0) return <UsersEmpty q={q} status={status} total={total} />;

  const from = (result.page - 1) * pageSize + 1;
  const to = from + users.length - 1;
  const count = `${total.toLocaleString("id-ID")} ${whoLabel(status)}`;
  const summary =
    (q ? `${count} cocok dengan “${q}”` : count) +
    (totalPages > 1 ? ` · menampilkan ${from}–${to}` : "");

  return (
    <>
      <p role="status" className="text-sm text-muted-foreground">
        {summary}
      </p>
      {/* key: pemberitahuan hasil aksi tidak terbawa ke halaman/pencarian/saringan lain. */}
      <AdminFeedback key={`${q}:${status}:${result.page}`}>
        <UsersTable
          users={users}
          currentUserId={currentUserId}
          caption={`Daftar ${whoLabel(status)}, halaman ${result.page} dari ${totalPages}`}
        />
      </AdminFeedback>
      <UsersPagination q={q} status={status} page={result.page} totalPages={totalPages} />
    </>
  );
}

function UsersEmpty({ q, status, total }: { q: string; status: UserStatusFilter; total: number }) {
  const cta = "h-(--control-h-lg) w-full sm:w-auto md:h-(--control-h)";
  if (total > 0) {
    // Cadangan: service sudah menjepit nomor halaman ke halaman terakhir.
    return (
      <EmptyState
        icon={<IconFileSearch />}
        title="Halaman ini kosong"
        description="Daftar pengguna berubah sejak tautan ini dibuat."
        action={
          <Button asChild variant="outline" className={cta}>
            <Link href={usersHref({ q, status })}>Ke halaman pertama</Link>
          </Button>
        }
      />
    );
  }
  if (q || status !== "all") {
    const who = whoLabel(status);
    return (
      <EmptyState
        icon={<IconUserSearch />}
        title={q ? `Tidak ada ${who} yang cocok` : `Tidak ada ${who}`}
        // "Hapus pencarian" sudah ada di bilah pencarian; tidak diulang di sini.
        description={
          q
            ? `Tidak ada ${who} dengan email atau nama yang mengandung “${q}”. Periksa ejaannya atau cari dengan kata lain.`
            : "Saringan status ini sedang tidak berisi siapa pun."
        }
        action={
          status !== "all" ? (
            <Button asChild variant="outline" className={cta}>
              <Link href={usersHref({ q })}>Tampilkan semua status</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<IconUsers />}
      title="Belum ada pengguna"
      description="Pengguna muncul di sini setelah mendaftar dengan email perusahaan atau ditambahkan admin."
    />
  );
}
