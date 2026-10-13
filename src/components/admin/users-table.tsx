/* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role --
   peran eksplisit (table/rowgroup/row/cell) menjaga semantik tabel saat display diubah ke
   block/flex untuk tampilan kartu; Safari/VoiceOver membuang semantik tabel tanpa ini. */
import type { AdminUserRow } from "@/features/admin/service";
import { cn } from "@/lib/utils";
import { EmailText } from "./email-text";
import { AccountStatusBadge, RoleBadge } from "./user-badges";
import { UserRowActions } from "./user-row-actions";

const TZ = "Asia/Jakarta";

/** Tanggal dan jam di dua potong tak terpatahkan: kartu sempit boleh turun baris di antaranya saja. */
function LastLogin({ at }: { at: Date }) {
  const date = at.toLocaleDateString("id-ID", { timeZone: TZ, dateStyle: "medium" });
  const time = at.toLocaleTimeString("id-ID", { timeZone: TZ, timeStyle: "short" });
  return (
    <time dateTime={at.toISOString()}>
      <span className="whitespace-nowrap">{date},</span>{" "}
      <span className="whitespace-nowrap">{time}</span>
    </time>
  );
}

/*
 * Satu <table> untuk semua lebar, bergantung LEBAR KONTAINER (@container), bukan viewport:
 * < 56rem tiap baris jadi kartu (flex-wrap: identitas + aksi, lalu badge + jumlah dataset yang turun
 * baris bila sempit, lalu waktu masuk), ≥ 56rem kembali ke tabel. Ambang 56rem (bukan 42rem) dan
 * kolom sekunder selebar isi minimum (w-px) memberi kolom email, identitas utama, sisa ruang terbesar:
 * di 1024 px (sidebar terbuka) daftar memakai kartu, di 1280 px ke atas tabel dengan email satu baris.
 * Urutan DOM sel tetap (kolom tabel); hanya urutan visual kartu yang diatur `order`. Label kartu
 * aria-hidden karena header kolom (sr-only di mode kartu) sudah memberi nama sel ke pembaca layar.
 */
const CELL = "block @4xl:table-cell @4xl:px-3 @4xl:py-2.5 @4xl:align-middle";
/** Kolom sekunder di mode tabel: selebar isi minimumnya, sisa lebar jatuh ke kolom email. */
const NARROW = "@4xl:w-px";
const TH = "px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";

interface UsersTableProps {
  users: AdminUserRow[];
  currentUserId: string;
  caption: string;
}

export function UsersTable({ users, currentUserId, caption }: UsersTableProps) {
  return (
    <div className="@container overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table
          role="table"
          data-testid="admin-users-table"
          className="block w-full text-sm @4xl:table @4xl:border-collapse"
        >
          <caption className="sr-only">{caption}</caption>
          <thead
            role="rowgroup"
            className="sr-only @4xl:not-sr-only @4xl:table-header-group @4xl:border-b @4xl:bg-muted/50"
          >
            <tr role="row">
              <th role="columnheader" scope="col" className={cn(TH, "pl-4")}>
                Pengguna
              </th>
              <th role="columnheader" scope="col" className={TH}>
                Peran
              </th>
              <th role="columnheader" scope="col" className={TH}>
                Status
              </th>
              <th role="columnheader" scope="col" className={TH}>
                Terakhir masuk
              </th>
              <th role="columnheader" scope="col" className={cn(TH, "text-right")}>
                Dataset
              </th>
              <th role="columnheader" scope="col" className={cn(TH, "pr-4")}>
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup" className="block @4xl:table-row-group">
            {users.map((u) => (
              <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  return (
    <tr
      role="row"
      data-testid="admin-user-row"
      data-email={user.email}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0 @4xl:table-row @4xl:p-0 @4xl:hover:bg-muted/40"
    >
      {/* Kartu: sisakan ±4rem untuk tombol aksi di baris yang sama, sehingga badge selalu turun. */}
      <td
        role="cell"
        className={cn(
          CELL,
          "order-1 min-w-0 grow basis-[calc(100%-4rem)] @4xl:w-full @4xl:max-w-0 @4xl:pl-4",
        )}
      >
        {/* Email = identitas utama: tidak pernah dipotong; nama yang dipotong lebih dulu. */}
        <span className="block font-medium [overflow-wrap:anywhere]" title={user.email}>
          <EmailText email={user.email} />
        </span>
        {user.name || isSelf ? (
          <span className="block truncate text-muted-foreground" title={user.name ?? undefined}>
            {user.name ? <bdi>{user.name}</bdi> : null}
            {user.name && isSelf ? " · " : null}
            {isSelf ? "Anda" : null}
          </span>
        ) : null}
      </td>
      <td role="cell" className={cn(CELL, NARROW, "order-3")}>
        <RoleBadge isAdmin={user.isAdmin} />
      </td>
      <td role="cell" className={cn(CELL, NARROW, "order-4")}>
        <AccountStatusBadge isActive={user.isActive} emailVerified={user.emailVerified} />
      </td>
      <td
        role="cell"
        className={cn(CELL, "order-6 basis-full text-muted-foreground @4xl:whitespace-nowrap")}
      >
        <span aria-hidden className="@4xl:hidden">
          Terakhir masuk{" "}
        </span>
        {user.lastLoginAt ? <LastLogin at={user.lastLoginAt} /> : "Belum pernah"}
      </td>
      <td
        role="cell"
        className={cn(
          CELL,
          NARROW,
          "order-5 whitespace-nowrap text-muted-foreground tabular-nums @4xl:text-right",
        )}
      >
        {user.datasetCount}
        <span aria-hidden className="@4xl:hidden">
          {" "}
          dataset
        </span>
      </td>
      <td
        role="cell"
        className={cn(
          CELL,
          "order-2 -my-1.5 -mr-2 ms-auto @4xl:my-0 @4xl:mr-0 @4xl:w-px @4xl:py-1 @4xl:pr-4 @4xl:pl-1",
        )}
      >
        {/* Hanya field yang dipakai menu yang dikirim ke klien. */}
        <UserRowActions
          user={{
            id: user.id,
            email: user.email,
            isAdmin: user.isAdmin,
            isActive: user.isActive,
            emailVerified: user.emailVerified,
            datasetCount: user.datasetCount,
          }}
          isSelf={isSelf}
        />
      </td>
    </tr>
  );
}
