"use client";

import { IconCircleCheck, IconUserPlus } from "@tabler/icons-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { EmailText } from "@/components/admin/email-text";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { ShareRole, ShareUserOption } from "@/features/sharing/types";
import { RoleSelect } from "./role-select";
import { grantResult, keepSelection } from "./share-model";
import { SharePicker } from "./share-picker";

/**
 * Konfirmasi terlihat setelah "Bagikan" berhasil (review T-016 R6-UI-3): baris baru di daftar akses
 * biasanya di luar layar. Tanpa role=status — wilayah aria-live panel sudah mengumumkan teks yang sama.
 */
export function GrantDone({ email, role }: { email: string; role: ShareRole }) {
  return (
    <p data-testid="share-add-done" className="flex items-start gap-2 text-sm">
      <IconCircleCheck size={20} stroke={1.5} aria-hidden className="mt-px shrink-0 text-success" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <EmailText email={email} /> {grantResult(role)}
      </span>
    </p>
  );
}

interface GrantAdded {
  userId: string;
  email: string;
  role: ShareRole;
}

/**
 * Konfirmasi hanya selama masih benar (review T-016 R7): orang itu dicabut atau perannya diubah di
 * daftar akses → baris hilang, tidak menyebut akses yang sudah tidak ada.
 */
export const grantStillTrue = (added: GrantAdded | null, granted: ReadonlyMap<string, ShareRole>) =>
  added !== null && granted.get(added.userId) === added.role;

interface ShareAddProps {
  dashboardId: string;
  role: ShareRole;
  onRole: (role: ShareRole) => void;
  granted: ReadonlyMap<string, ShareRole>;
  busy: string | null;
  /** Galat "Bagikan" dari server (isian tetap). */
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onAdd: (user: ShareUserOption, role: ShareRole) => Promise<boolean>;
  /** Peringatan (editor / kolom filter) tepat di atas tombol "Bagikan": dibaca sebelum menekan. */
  warnings: ReactNode;
  /**
   * id peringatan editor saat tampil: deskripsi Select peran dan tombol "Bagikan", jadi tetap
   * terbaca walau pengumuman wilayah aria-live terlewat (review T-016 R3-UI-1).
   */
  describedBy?: string;
}

/**
 * Tambah orang (T-016): cari pengguna → pilih peran → "Bagikan". Tanpa pilihan, "Bagikan" memberi
 * tahu di bawah kolom cari dan memindah fokus ke sana. Berhasil → pencarian dikosongkan dan fokus
 * kembali ke kolom cari untuk orang berikutnya, hasilnya tampil tepat di bawah kolom cari (GrantDone;
 * tetap terlihat di ponsel walau ada peringatan, review R7) sampai memilih orang lain, menekan
 * "Bagikan" lagi, atau akses orang itu berubah di daftar; gagal → pilihan dan peran tetap.
 */
export function ShareAdd({
  dashboardId,
  role,
  onRole,
  granted,
  busy,
  error,
  inputRef,
  onAdd,
  warnings,
  describedBy,
}: ShareAddProps) {
  const id = useId();
  const [user, setUser] = useState<ShareUserOption | null>(null);
  const [missing, setMissing] = useState(false);
  /** "Bagikan" terakhir yang berhasil (baris konfirmasi terlihat). */
  const [added, setAdded] = useState<GrantAdded | null>(null);
  /** Naik setiap berhasil: pemilih dipasang ulang (kata kunci + hasil kosong). */
  const [round, setRound] = useState(0);
  const focusSearch = useRef(false);

  useEffect(() => {
    if (!focusSearch.current) return;
    focusSearch.current = false;
    inputRef.current?.focus();
  }, [round, inputRef]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAdded(null);
    if (!user) {
      setMissing(true);
      inputRef.current?.focus();
      return;
    }
    if (await onAdd(user, role)) {
      setAdded({ userId: user.id, email: user.email, role });
      setUser(null);
      focusSearch.current = true;
      setRound((n) => n + 1);
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby={`${id}-h`} className="flex flex-col gap-3" noValidate>
      <h3 id={`${id}-h`} className="text-sm font-semibold">
        Tambah orang
      </h3>
      <SharePicker
        key={round}
        dashboardId={dashboardId}
        selectedId={user?.id ?? null}
        disabled={busy !== null}
        granted={granted}
        inputRef={inputRef}
        errorId={missing && !user ? `${id}-missing` : undefined}
        errorText="Pilih pengguna dari hasil pencarian dulu."
        onSelect={(u) => {
          setUser(u);
          setMissing(false);
          setAdded(null);
        }}
        onResults={(items) => setUser((u) => keepSelection(u, items))}
      />
      {added && grantStillTrue(added, granted) ? (
        <GrantDone email={added.email} role={added.role} />
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-role`} className="text-sm font-medium">
          Peran
        </label>
        <RoleSelect
          id={`${id}-role`}
          value={role}
          onChange={onRole}
          disabled={busy !== null}
          aria-describedby={describedBy}
          data-testid="share-role"
          className="md:w-56"
        />
      </div>
      {warnings}
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <Button
        type="submit"
        pending={busy === "add"}
        disabled={busy !== null}
        leadingIcon={<IconUserPlus aria-hidden />}
        aria-describedby={describedBy}
        data-testid="share-add"
        className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto md:self-start"
      >
        Bagikan
      </Button>
    </form>
  );
}
