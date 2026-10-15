"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  grantShareAction,
  revokeShareAction,
  setOrgShareAction,
  setShareRoleAction,
} from "@/features/sharing/actions";
import type {
  ShareActionResult,
  ShareGrantView,
  ShareRole,
  ShareState,
} from "@/features/sharing/types";
import { ShareAdd } from "./share-add";
import { ShareGrants, roleRestoreTarget } from "./share-grants";
import { announce, showEditorWarning, showFilterWarning } from "./share-model";
import { ShareOrg } from "./share-org";
import { ShareWarnings } from "./share-warnings";
import { useShareState, type ShareSection } from "./use-share-state";

const bar = "animate-pulse rounded-md bg-muted motion-reduce:animate-none";

/**
 * Isi dialog share (T-016): berbagi organisasi, tambah orang (+ peringatan), daftar akses. Fokus:
 * kolom cari setelah dimuat; selama aksi berjalan fokus ditahan di dialog (tombol yang ditekan jadi
 * disabled), lalu kembali ke kontrol pemicunya. Hasil diumumkan sopan lewat satu wilayah aria-live.
 * Selama aksi berjalan dialog tidak bisa ditutup (onBusyChange): galatnya selalu terlihat (R6-UI-2).
 */
export function SharePanel({
  dashboardId,
  boxRef,
  onBusyChange,
}: {
  dashboardId: string;
  /** Kontainer dialog (tabIndex -1): tempat fokus ditahan selama aksi berjalan. */
  boxRef: RefObject<HTMLDivElement | null>;
  /** Ada aksi share yang berjalan (dialog menahan diri tetap terbuka). */
  onBusyChange: (busy: boolean) => void;
}) {
  const s = useShareState(dashboardId);
  const [addRole, setAddRole] = useState<ShareRole>("VIEWER");
  /** Orang yang perannya terakhir diubah: disebut di galat bila barisnya sudah hilang (R6-UI-1). */
  const [roleTarget, setRoleTarget] = useState<ShareGrantView | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** id peringatan editor: deskripsi Select peran dan tombol "Bagikan" (review T-016 R3-UI-1). */
  const editorWarnId = useId();
  /** Kontrol yang menerima fokus lagi setelah aksi selesai. */
  const restoreTo = useRef<() => HTMLElement | null>(() => null);
  const ready = s.load.status === "ready";

  // Dimuat: fokus awal ke kolom cari — hanya bila user belum memindah fokus ke tempat lain.
  useEffect(() => {
    if (ready && document.activeElement === boxRef.current) searchRef.current?.focus();
  }, [ready, boxRef]);

  useEffect(() => {
    onBusyChange(s.busy !== null);
    return () => onBusyChange(false);
  }, [s.busy, onBusyChange]);

  // Fokus tidak jatuh ke <body> saat kontrol yang ditekan menjadi disabled; kembali setelah selesai.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const active = document.activeElement;
    const lost =
      !active ||
      active === document.body ||
      (box.contains(active) && (active as HTMLButtonElement).disabled === true);
    if (s.busy) {
      if (lost) box.focus();
      return;
    }
    if (active !== box && !lost) return;
    const el = restoreTo.current();
    (el?.isConnected && !(el as HTMLButtonElement).disabled ? el : searchRef.current)?.focus();
  }, [s.busy, boxRef]);

  if (s.load.status === "loading") {
    return (
      <div aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only" role="status">
          Memuat pengaturan berbagi…
        </span>
        <div className={`h-11 ${bar}`} />
        <div className={`h-24 ${bar}`} />
        <div className={`h-32 ${bar}`} />
      </div>
    );
  }
  if (s.load.status === "error") {
    return (
      <FormAlert tone="error">
        <span className="block">Pengaturan berbagi gagal dimuat. {s.load.message}</span>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-(--control-h-lg) md:h-(--control-h-sm)"
          leadingIcon={<IconRefresh aria-hidden />}
          onClick={s.retry}
        >
          Coba lagi
        </Button>
      </FormAlert>
    );
  }

  const data = s.load.data;
  const granted = new Map(data.grants.map((g) => [g.userId, g.role] as const));
  const editorWarning = showEditorWarning(data.grants, data.warnings, addRole);
  const errorAt = (at: ShareSection) => (s.error?.at === at ? s.error.message : null);
  /** Orang yang ganti perannya gagal (galat di barisnya, atau di atas daftar bila barisnya hilang). */
  const roleErrorUser =
    s.error?.at === "grants" && s.error.key.startsWith("role:")
      ? s.error.key.slice("role:".length)
      : null;
  const run = (
    key: string,
    at: ShareSection,
    restore: () => HTMLElement | null,
    op: () => Promise<ShareActionResult<ShareState>>,
    done: (d: ShareState) => string,
  ) => {
    restoreTo.current = restore;
    return s.run(key, at, op, done);
  };
  const focused = () => {
    const el = document.activeElement;
    return el instanceof HTMLElement ? () => el : () => null;
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="sr-only" aria-live="polite">
        {s.announcement}
      </p>

      <ShareOrg
        on={data.orgShared}
        disabled={s.busy !== null}
        error={errorAt("org")}
        onChange={(on, el) =>
          void run(
            "org",
            "org",
            () => el,
            () => setOrgShareAction(dashboardId, on),
            () => announce.org(on),
          )
        }
      />

      <div className="border-t pt-5">
        <ShareAdd
          dashboardId={dashboardId}
          role={addRole}
          onRole={setAddRole}
          granted={granted}
          busy={s.busy}
          error={errorAt("add")}
          inputRef={searchRef}
          describedBy={editorWarning ? editorWarnId : undefined}
          onAdd={(user, role) =>
            run(
              "add",
              "add",
              focused(),
              () => grantShareAction(dashboardId, { userId: user.id }, role),
              () => announce.grant(user.email, role),
            )
          }
          warnings={
            <ShareWarnings
              dashboardId={dashboardId}
              editor={editorWarning}
              editorId={editorWarnId}
              filterColumns={showFilterWarning(data.warnings) ? data.warnings.filterColumns : []}
            />
          }
        />
      </div>

      <div className="border-t pt-5">
        <ShareGrants
          grants={data.grants}
          orgShared={data.orgShared}
          busy={s.busy}
          error={errorAt("grants")}
          errorUserId={roleErrorUser}
          errorEmail={roleTarget?.userId === roleErrorUser ? roleTarget.email : null}
          revokeError={errorAt("revoke")}
          onRevokeCancel={s.clearError}
          onRole={(g, role) => {
            setRoleTarget(g);
            void run(
              `role:${g.userId}`,
              "grants",
              () => roleRestoreTarget(boxRef.current, g.userId),
              () => setShareRoleAction(dashboardId, g.userId, role),
              () => announce.role(g.email, role),
            );
          }}
          onRevoke={(g) =>
            run(
              `revoke:${g.userId}`,
              "revoke",
              () => null,
              () => revokeShareAction(dashboardId, g.userId),
              () => announce.revoke(g.email),
            )
          }
        />
      </div>
    </div>
  );
}
