/* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role --
   peran eksplisit (table/rowgroup/row/cell) menjaga semantik tabel saat display diubah ke
   block/grid untuk tampilan kartu; Safari/VoiceOver membuang semantik tabel tanpa ini. */
import type { AdminUserRow } from "@/features/admin/service";
import { cn } from "@/lib/utils";
import { AccountStatusBadge, RoleBadge } from "./user-badges";
import { UserRowActions } from "./user-row-actions";
import type { TransferTarget } from "./transfer-dialog";

function formatDateTime(d: Date): string {
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/*
 * Satu <table> untuk semua lebar, bergantung LEBAR KONTAINER (@container), bukan viewport:
 * < 42rem tiap baris jadi kartu (grid 3 kolom), ≥ 42rem kembali ke tabel. Label kartu aria-hidden
 * karena header kolom (sr-only di mode kartu) sudah memberi nama sel ke pembaca layar.
 */
const CELL = "block @2xl:table-cell @2xl:px-3 @2xl:py-2.5 @2xl:align-middle";
const TH = "px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";

interface UsersTableProps {
  users: AdminUserRow[];
  currentUserId: string;
  targets: TransferTarget[];
  caption: string;
}

export function UsersTable({ users, currentUserId, targets, caption }: UsersTableProps) {
  return (
    <div className="@container overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table
          role="table"
          data-testid="admin-users-table"
          className="block w-full text-sm @2xl:table @2xl:border-collapse"
        >
          <caption className="sr-only">{caption}</caption>
          <thead
            role="rowgroup"
            className="sr-only @2xl:not-sr-only @2xl:table-header-group @2xl:border-b @2xl:bg-muted/50"
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
                Login terakhir
              </th>
              <th role="columnheader" scope="col" className={cn(TH, "text-right")}>
                Dataset
              </th>
              <th role="columnheader" scope="col" className={cn(TH, "pr-4")}>
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup" className="block @2xl:table-row-group">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === currentUserId}
                targets={!u.isActive && u.datasetCount > 0 ? targets : []}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  targets,
}: {
  user: AdminUserRow;
  isSelf: boolean;
  targets: TransferTarget[];
}) {
  const subline = [user.name, isSelf ? "Anda" : null].filter(Boolean).join(" · ");
  return (
    <tr
      role="row"
      data-testid="admin-user-row"
      data-email={user.email}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0 @2xl:table-row @2xl:p-0 @2xl:hover:bg-muted/40"
    >
      <td
        role="cell"
        className={cn(CELL, "col-[1/3] row-1 min-w-0 @2xl:w-full @2xl:max-w-0 @2xl:pl-4")}
      >
        <span className="block truncate font-medium" title={user.email}>
          {user.email}
        </span>
        {subline ? (
          <span className="block truncate text-muted-foreground" title={user.name ?? undefined}>
            {subline}
          </span>
        ) : null}
      </td>
      <td role="cell" className={cn(CELL, "col-1 row-2")}>
        <RoleBadge isAdmin={user.isAdmin} />
      </td>
      <td role="cell" className={cn(CELL, "col-2 row-2 justify-self-start")}>
        <AccountStatusBadge isActive={user.isActive} emailVerified={user.emailVerified} />
      </td>
      <td
        role="cell"
        className={cn(CELL, "col-[1/4] row-3 text-muted-foreground @2xl:whitespace-nowrap")}
      >
        <span aria-hidden className="@2xl:hidden">
          Login terakhir{" "}
        </span>
        {user.lastLoginAt ? (
          <time dateTime={user.lastLoginAt.toISOString()}>{formatDateTime(user.lastLoginAt)}</time>
        ) : (
          "Belum pernah"
        )}
      </td>
      <td
        role="cell"
        className={cn(
          CELL,
          "col-3 row-2 justify-self-end text-muted-foreground tabular-nums @2xl:text-right",
        )}
      >
        {user.datasetCount}
        <span aria-hidden className="@2xl:hidden">
          {" "}
          dataset
        </span>
      </td>
      <td
        role="cell"
        className={cn(
          CELL,
          "col-3 row-1 -my-1.5 -mr-2 justify-self-end @2xl:my-0 @2xl:mr-0 @2xl:w-px @2xl:py-1 @2xl:pr-4 @2xl:pl-1",
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
          targets={targets}
        />
      </td>
    </tr>
  );
}
