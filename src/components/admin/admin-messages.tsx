import { IconShieldOff, IconShieldPlus, IconUserOff } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { AdminErrorCode, TransferSummary } from "@/features/admin/types";

/*
 * Teks UI aksi admin. Galat dipetakan per kode: NOT_FOUND dan LAST_ADMIN memakai teks UI (memberi
 * langkah berikutnya, tanpa membedakan "tidak ada" dari "tidak berhak", D2); kode lain memakai
 * pesan server yang lebih spesifik (sisa menit rate limit, alasan INVALID/FORBIDDEN, sisa kuota).
 */
const ERRORS: Record<AdminErrorCode, { text: string; preferServer: boolean }> = {
  NOT_FOUND: {
    text: "Pengguna tidak ditemukan, atau akses admin Anda sudah berakhir. Muat ulang halaman.",
    preferServer: false,
  },
  LAST_ADMIN: {
    text: "Harus tetap ada minimal satu admin aktif. Jadikan pengguna lain admin terlebih dulu.",
    preferServer: false,
  },
  FORBIDDEN: { text: "Tindakan ini tidak diizinkan untuk akun tersebut.", preferServer: true },
  INVALID: {
    text: "Permintaan tidak valid. Muat ulang halaman, lalu coba lagi.",
    preferServer: true,
  },
  RATE_LIMITED: {
    text: "Terlalu banyak perubahan dalam waktu singkat. Tunggu sebentar, lalu coba lagi.",
    preferServer: true,
  },
  LIMIT_REACHED: {
    text: "Pengguna tujuan tidak punya cukup ruang untuk dataset ini. Pilih pengguna lain.",
    preferServer: true,
  },
  BUSY: { text: "Sedang ada perubahan lain. Coba lagi beberapa saat lagi.", preferServer: true },
};

export const NETWORK_ERROR = "Tidak bisa menghubungi server. Periksa koneksi, lalu coba lagi.";

export function adminErrorText(code: AdminErrorCode, serverMessage: string): string {
  // Kode baru dari server yang belum dikenal UI: tampilkan pesan server apa adanya.
  const known: { text: string; preferServer: boolean } | undefined = ERRORS[code];
  if (!known) return serverMessage || NETWORK_ERROR;
  return known.preferServer && serverMessage ? serverMessage : known.text;
}

export type ConfirmKind = "grant" | "revoke" | "deactivate";

interface ConfirmCopy {
  title: string;
  body: ReactNode;
  label: string;
  icon: ReactNode;
  destructive: boolean;
}

/** Judul pendek; email masuk ke badan teks agar alamat panjang membungkus dengan rapi. */
export function confirmCopy(kind: ConfirmKind, email: string, isSelf: boolean): ConfirmCopy {
  const who = (
    <strong className="font-medium text-foreground [overflow-wrap:anywhere]">{email}</strong>
  );
  if (kind === "grant") {
    return {
      title: "Jadikan admin?",
      body: (
        <>
          {who} akan bisa mengelola semua pengguna: memberi dan mencabut peran admin, menonaktifkan
          akun, dan mengalihkan dataset.
        </>
      ),
      label: "Jadikan admin",
      icon: <IconShieldPlus aria-hidden />,
      destructive: false,
    };
  }
  if (kind === "revoke") {
    return {
      title: isSelf ? "Cabut akses admin Anda?" : "Cabut peran admin?",
      body: isSelf ? (
        <>
          Anda akan kehilangan akses ke halaman Admin dan tidak bisa mengembalikannya sendiri. Hanya
          admin lain yang bisa menjadikan Anda admin lagi.
        </>
      ) : (
        <>
          {who} tidak bisa lagi membuka halaman Admin. Ia otomatis keluar dari semua perangkat dan
          perlu masuk lagi.
        </>
      ),
      label: isSelf ? "Cabut akses saya" : "Cabut admin",
      icon: <IconShieldOff aria-hidden />,
      destructive: true,
    };
  }
  return {
    title: "Nonaktifkan pengguna?",
    body: (
      <>
        {who} otomatis keluar dari semua perangkat dan tidak bisa masuk sampai diaktifkan lagi.
        Dataset dan dashboard miliknya tetap ada dan bisa Anda alihkan ke pengguna lain lewat
        saringan status Nonaktif.
      </>
    ),
    label: "Nonaktifkan",
    icon: <IconUserOff aria-hidden />,
    destructive: true,
  };
}

export const SUCCESS = {
  grant: (email: string) => `${email} sekarang admin.`,
  revoke: (email: string) => `${email} bukan admin lagi. Ia otomatis keluar dari semua perangkat.`,
  deactivate: (email: string) => `${email} dinonaktifkan. Ia otomatis keluar dari semua perangkat.`,
  activate: (email: string) => `${email} aktif kembali dan bisa masuk lagi.`,
};

/** Daftar nama yang diganti dibatasi agar pemberitahuan tidak memanjang tanpa batas. */
const RENAMED_SHOWN = 10;

export function transferResult(data: TransferSummary, targetEmail: string): ReactNode {
  const shown = data.renamed.slice(0, RENAMED_SHOWN);
  const rest = data.renamed.length - shown.length;
  return (
    <>
      <span className="block">
        {data.moved > 0
          ? `${data.moved} dataset beserta dashboard-nya dialihkan ke ${targetEmail}.`
          : "Tidak ada dataset yang perlu dialihkan."}
      </span>
      {shown.length > 0 ? (
        <>
          <span className="mt-2 block">Diberi nama baru karena namanya sudah dipakai:</span>
          <ul className="mt-1 list-disc pl-5 [overflow-wrap:anywhere]">
            {shown.map((r) => (
              <li key={r.datasetId}>
                “{r.from}” menjadi “{r.to}”
              </li>
            ))}
            {rest > 0 ? <li>dan {rest} dataset lainnya</li> : null}
          </ul>
        </>
      ) : null}
      {data.quotaExceeded ? (
        <span className="mt-2 block font-medium">
          Perhatian: penyimpanan {targetEmail} kini penuh atau melebihi kuota, jadi unggahan
          berikutnya akan ditolak sampai sebagian data dihapus.
        </span>
      ) : null}
    </>
  );
}
