"use client";

import {
  IconBookmark,
  IconBookmarkPlus,
  IconCheck,
  IconLink,
  IconSettings,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useEffect, useId, useState, type FormEvent } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { SavedView } from "@/features/dashboards/views";
import { useDashboardFilters } from "./filter-context";
import { encodeFilterParam, sanitize, type FilterState } from "./filter-model";

/*
 * Tampilan tersimpan (T-tf88): menu "Tampilan" di bilah filter — pilih tampilan (filter di URL diganti,
 * tautan bisa dibagikan), simpan filter saat ini dengan nama (pribadi; pemilik/editor bisa bersama),
 * salin tautan, dan kelola (ganti nama, perbarui dengan filter saat ini, hapus).
 */

const NAME_MAX = 60;
const CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
type ApiResult<T> = { ok: true; data: T } | { ok: false; message?: string; field?: string };

async function call<T>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return {
      ok: false,
      message: "Tidak bisa menghubungi server. Periksa koneksi, lalu coba lagi.",
    };
  }
}

const sortViews = (list: SavedView[]) =>
  [...list].sort(
    (a, b) => Number(b.shared) - Number(a.shared) || a.name.localeCompare(b.name, "id"),
  );

export function SavedViews({ canShare }: { canShare: boolean }) {
  const api = useDashboardFilters();
  const { dashboardId, state, columns, crossColumns } = api;
  const base = `/api/dashboards/${dashboardId}/views`;
  const [views, setViews] = useState<SavedView[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    let alive = true;
    void call<SavedView[]>(base, "GET").then((r) => {
      if (alive) setViews(r.ok ? sortViews(r.data) : []);
    });
    return () => {
      alive = false;
    };
  }, [base]);

  // Tampilan yang sama dengan filter saat ini (disaring seperti saat diterapkan; urutan filter diabaikan).
  const currentKey = viewKey(state);
  const matching = views?.find(
    (v) =>
      viewKey(sanitize(v.state, { columns, crossColumns, widgetIds: api.widgetIds })) ===
      currentKey,
  );
  const shared = views?.filter((v) => v.shared) ?? [];
  const mine = views?.filter((v) => !v.shared) ?? [];
  const manageable = views?.filter((v) => v.canManage) ?? [];

  const apply = (v: SavedView) => {
    api.applyState(v.state);
    setAnnounce(`Tampilan “${v.name}” diterapkan.`);
  };

  return (
    <div className="flex flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<IconBookmark aria-hidden />}
            className="h-(--control-h-lg) w-full justify-start md:h-(--control-h-sm) md:w-auto xl:w-full"
            data-testid="saved-views-trigger"
          >
            <span className="truncate">Tampilan{matching ? `: ${matching.name}` : ""}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72" data-testid="saved-views-menu">
          {views === null ? (
            <DropdownMenuLabel>Memuat…</DropdownMenuLabel>
          ) : views.length === 0 ? (
            <DropdownMenuLabel className="font-normal">
              Belum ada tampilan. Simpan filter yang sering dipakai agar tinggal dipilih.
            </DropdownMenuLabel>
          ) : null}
          {shared.length ? <DropdownMenuLabel>Tampilan bersama</DropdownMenuLabel> : null}
          {shared.map((v) => (
            <ViewItem
              key={v.id}
              view={v}
              active={v.id === matching?.id}
              onSelect={() => apply(v)}
            />
          ))}
          {mine.length ? <DropdownMenuLabel>Tampilan saya</DropdownMenuLabel> : null}
          {mine.map((v) => (
            <ViewItem
              key={v.id}
              view={v}
              active={v.id === matching?.id}
              onSelect={() => apply(v)}
            />
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaving(true)}>
            <IconBookmarkPlus aria-hidden />
            Simpan filter ini sebagai tampilan…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => setAnnounce("Tautan filter disalin."))
                .catch(() => setAnnounce("Tautan tidak bisa disalin. Salin dari bilah alamat."));
            }}
          >
            <IconLink aria-hidden />
            Salin tautan filter ini
          </DropdownMenuItem>
          {manageable.length ? (
            <DropdownMenuItem onSelect={() => setManaging(true)}>
              <IconSettings aria-hidden />
              Kelola tampilan…
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="sr-only" aria-live="polite" data-testid="saved-views-announce">
        {announce}
      </p>
      <SaveDialog
        open={saving}
        onOpenChange={setSaving}
        canShare={canShare}
        onSave={async (name, isShared) => {
          const r = await call<SavedView>(base, "POST", { name, state, shared: isShared });
          if (r.ok) {
            setViews((list) => sortViews([...(list ?? []), r.data]));
            setAnnounce(`Tampilan “${r.data.name}” disimpan.`);
          }
          return r;
        }}
      />
      <ManageDialog
        open={managing}
        onOpenChange={setManaging}
        views={manageable}
        canShare={canShare}
        onUpdate={async (v, patch) => {
          const r = await call<SavedView>(`${base}/${v.id}`, "PATCH", patch);
          if (r.ok)
            setViews((list) => sortViews((list ?? []).map((x) => (x.id === v.id ? r.data : x))));
          return r;
        }}
        onDelete={async (v) => {
          const r = await call<null>(`${base}/${v.id}`, "DELETE");
          if (r.ok) setViews((list) => (list ?? []).filter((x) => x.id !== v.id));
          return r;
        }}
        currentState={state}
      />
    </div>
  );
}

/** Kunci perbandingan status: filter diurutkan per kolom (urutan memilih tidak membedakan tampilan). */
function viewKey(s: FilterState): string {
  const filters = [...s.filters].sort((a, b) => a.column.localeCompare(b.column));
  return encodeFilterParam({ ...s, filters }) ?? "";
}

function ViewItem({
  view,
  active,
  onSelect,
}: {
  view: SavedView;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} data-testid="saved-view-item">
      {active ? (
        <IconCheck aria-hidden />
      ) : view.shared ? (
        <IconUsers aria-hidden />
      ) : (
        <IconBookmark aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
      {active ? <span className="sr-only">(sedang dipakai)</span> : null}
    </DropdownMenuItem>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  canShare,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canShare: boolean;
  onSave: (name: string, shared: boolean) => Promise<ApiResult<SavedView>>;
}) {
  const [name, setName] = useState("");
  const [isShared, setShared] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sharedId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await onSave(name, isShared);
    setBusy(false);
    if (r.ok) {
      setName("");
      setShared(false);
      setError(null);
      onOpenChange(false);
    } else {
      setError({ field: r.field, message: r.message ?? "Tampilan belum bisa disimpan." });
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-lg"
          data-testid="save-view-dialog"
        >
          <Dialog.Title className="text-lg font-semibold">Simpan tampilan</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Filter yang sedang dipakai disimpan dengan nama, lalu tinggal dipilih dari menu
            Tampilan.
          </Dialog.Description>
          <form onSubmit={(e) => void submit(e)} noValidate className="mt-4 flex flex-col gap-4">
            {error && error.field !== "name" ? (
              <FormAlert tone="error">{error.message}</FormAlert>
            ) : null}
            <Field
              id="save-view-name"
              label="Nama tampilan"
              required
              hint="Mis. Jakarta – bulan ini."
              error={error?.field === "name" ? error.message : undefined}
            >
              <Input
                value={name}
                maxLength={NAME_MAX}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            {canShare ? (
              <div className="flex items-start gap-2 text-sm">
                <input
                  id={sharedId}
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={isShared}
                  aria-describedby={`${sharedId}-hint`}
                  onChange={(e) => setShared(e.target.checked)}
                />
                <div>
                  <label htmlFor={sharedId} className="block font-medium">
                    Tampilan bersama
                  </label>
                  <p id={`${sharedId}-hint`} className="text-muted-foreground">
                    Terlihat oleh semua yang punya akses ke dashboard ini.
                  </p>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Dialog.Close asChild>
                <Button variant="outline" className={CTA}>
                  Batal
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                pending={busy}
                leadingIcon={<IconBookmarkPlus aria-hidden />}
                className={CTA}
              >
                Simpan
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ManageDialog({
  open,
  onOpenChange,
  views,
  canShare,
  onUpdate,
  onDelete,
  currentState,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  views: SavedView[];
  canShare: boolean;
  onUpdate: (
    v: SavedView,
    patch: { name?: string; state?: FilterState; shared?: boolean },
  ) => Promise<ApiResult<SavedView>>;
  onDelete: (v: SavedView) => Promise<ApiResult<null>>;
  currentState: FilterState;
}) {
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) setMessage(null);
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-card p-6 shadow-lg"
          data-testid="manage-views-dialog"
        >
          <Dialog.Title className="text-lg font-semibold">Kelola tampilan</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Ganti nama, ganti isi dengan filter yang sedang dipakai, atau hapus.
          </Dialog.Description>
          {message ? (
            <div className="mt-3">
              <FormAlert tone={message.tone}>{message.text}</FormAlert>
            </div>
          ) : null}
          <ul className="mt-4 flex flex-col gap-3 overflow-y-auto">
            {views.map((v) => (
              <ManageRow
                key={v.id}
                view={v}
                canShare={canShare}
                onUpdate={async (patch, done) => {
                  const r = await onUpdate(v, patch);
                  setMessage(
                    r.ok
                      ? { tone: "success", text: done }
                      : { tone: "error", text: r.message ?? "Tampilan belum bisa diubah." },
                  );
                }}
                onDelete={async () => {
                  const r = await onDelete(v);
                  setMessage(
                    r.ok
                      ? { tone: "success", text: `Tampilan “${v.name}” dihapus.` }
                      : { tone: "error", text: r.message ?? "Tampilan belum bisa dihapus." },
                  );
                }}
                currentState={currentState}
              />
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Dialog.Close asChild>
              <Button variant="outline" className={CTA}>
                Tutup
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ManageRow({
  view,
  canShare,
  onUpdate,
  onDelete,
  currentState,
}: {
  view: SavedView;
  canShare: boolean;
  onUpdate: (
    patch: { name?: string; state?: FilterState; shared?: boolean },
    done: string,
  ) => Promise<void>;
  onDelete: () => Promise<void>;
  currentState: FilterState;
}) {
  const [name, setName] = useState(view.name);
  const [confirming, setConfirming] = useState(false);
  const inputId = useId();
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3" data-testid="manage-view-row">
      {view.canEditContent ? (
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          {view.shared ? "Tampilan bersama" : "Tampilan pribadi"}
        </label>
      ) : (
        <span className="text-xs text-muted-foreground">
          Tampilan bersama — hanya pemilik/editor yang bisa mengubah isinya
        </span>
      )}
      {view.canEditContent ? (
        <div className="flex gap-2">
          <Input
            id={inputId}
            value={name}
            maxLength={NAME_MAX}
            aria-label={`Nama tampilan ${view.name}`}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!name.trim() || name.trim() === view.name}
            onClick={() => void onUpdate({ name }, "Nama tampilan disimpan.")}
          >
            Simpan nama
          </Button>
        </div>
      ) : (
        <p className="text-sm font-medium">{view.name}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {view.canEditContent ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void onUpdate(
                { state: currentState },
                `Tampilan “${view.name}” kini memakai filter yang sedang dipakai.`,
              )
            }
          >
            Pakai filter saat ini
          </Button>
        ) : null}
        {view.mine && (canShare || view.shared) ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void onUpdate(
                { shared: !view.shared },
                view.shared
                  ? "Tampilan kini pribadi."
                  : "Tampilan kini terlihat semua yang punya akses.",
              )
            }
          >
            {view.shared ? "Jadikan pribadi" : "Jadikan bersama"}
          </Button>
        ) : null}
        {confirming ? (
          <>
            <Button variant="destructive" size="sm" onClick={() => void onDelete()}>
              Ya, hapus
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              Batal
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<IconTrash aria-hidden />}
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            Hapus
          </Button>
        )}
      </div>
    </li>
  );
}
