import "server-only";
import { Client, type ConnectConfig, type SFTPWrapper, type Stats } from "ssh2";
import { fingerprint, type ParsedOffsite } from "./config";

/*
 * Tes koneksi NAS Synology lewat SFTP dari server aplikasi (T-y8qq): periksa folder → daftar → tulis →
 * baca → hapus satu file kecil — hak yang dipakai backup.sh (rclone copy + retensi). Kunci host dipin:
 * tanpa kunci tersimpan, kunci yang dilihat dikembalikan untuk dicocokkan admin lalu disimpan; dengan
 * kunci tersimpan, kunci lain ditolak saat jabat tangan, sebelum password dikirim. Hanya kelas galat yang
 * dikembalikan ke admin, bukan isi respons server.
 */

const TIMEOUT_MS = 15_000;
const NET = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
];
// Kode status SFTP (draft-ietf-secsh-filexfer).
const NO_SUCH_FILE = 2;
const PERMISSION_DENIED = 3;

/** Galat yang pesannya sudah untuk admin. */
class ProbeError extends Error {}

/** "ssh-ed25519 AAAA…" dari blob kunci (format wire SSH: uint32 panjang + nama tipe). */
export function hostKeyLine(blob: Buffer): string {
  const len = blob.readUInt32BE(0);
  return `${blob.subarray(4, 4 + len).toString("latin1")} ${blob.toString("base64")}`;
}

/** Algoritme untuk tipe kunci yang dipin; backup.sh memakai daftar yang sama untuk rclone. */
export function hostKeyAlgorithms(hostKey: string): string[] {
  const type = hostKey.split(" ")[0] ?? "";
  return type === "ssh-rsa" ? ["rsa-sha2-512", "rsa-sha2-256", "ssh-rsa"] : [type];
}

/** Pesan yang bisa ditindak dari galat ssh2/SFTP/jaringan. */
export function probeMessage(
  e: unknown,
  c: { folder: string; hostKey: string },
  seen: string,
): string {
  if (e instanceof ProbeError) return e.message;
  const err = e as { code?: string | number; level?: string; message?: string };
  if (c.hostKey && seen && seen !== c.hostKey) {
    return `Kunci host NAS berbeda dari yang tersimpan (sekarang ${fingerprint(seen)}). Bila NAS memang diinstal ulang atau diganti, tekan "Lupakan kunci host", isi password, lalu tes lagi; bila tidak, jangan lanjutkan — koneksi bisa disadap.`;
  }
  if (err.level === "client-authentication") return "Username atau password ditolak NAS.";
  if (
    err.level === "client-timeout" ||
    NET.includes(String(err.code)) ||
    err.message === "closed"
  ) {
    return "Tidak bisa terhubung ke NAS dari server aplikasi. Pastikan alamat dan port benar, SFTP aktif di DSM (Panel Kontrol › Layanan File › FTP › SFTP), dan firewall mengizinkan server ini.";
  }
  if (err.level === "handshake" && c.hostKey) {
    return 'Jabat tangan SSH gagal: kunci host NAS tidak cocok dengan yang tersimpan. Bila NAS diinstal ulang, tekan "Lupakan kunci host", isi password, lalu tes lagi.';
  }
  if (err.code === NO_SUCH_FILE) {
    return `Folder ${c.folder} tidak ditemukan di NAS. Buat dulu lewat File Station; folder diawali nama shared folder, mis. /backup-data-dashboard.`;
  }
  if (err.code === PERMISSION_DENIED) {
    return "Akun ini tidak punya izin baca/tulis di folder tersebut. Atur di DSM: Panel Kontrol › Folder Bersama › Edit › Izin.";
  }
  return `Tes gagal (${err.level ?? err.code ?? "galat tidak dikenal"}).`;
}

function connect(
  conn: Client,
  c: ParsedOffsite,
  onKey: (line: string) => void,
): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    conn.once("ready", () =>
      conn.sftp((err, sftp) =>
        err
          ? reject(
              new ProbeError(
                "Login berhasil, tetapi NAS menolak SFTP untuk akun atau port ini. Periksa di DSM: SFTP aktif dengan nomor port yang sama dengan Port SFTP di sini (Panel Kontrol › Layanan File › FTP › SFTP), dan akun ini diizinkan memakai SFTP (Panel Kontrol › Hak Istimewa Aplikasi › SFTP).",
              ),
            )
          : resolve(sftp),
      ),
    );
    // ssh2 bisa memancarkan "error" dua kali (reset sebelum banner lalu koneksi hilang): selalu didengar.
    conn.on("error", reject);
    conn.once("close", () => reject(new Error("closed")));
    // DSM bisa meminta password lewat keyboard-interactive, bukan metode password.
    conn.on("keyboard-interactive", (_n, _i, _l, prompts, finish) =>
      finish(prompts.map(() => c.password)),
    );
    const config: ConnectConfig = {
      host: c.host,
      port: c.port,
      username: c.username,
      password: c.password,
      tryKeyboard: true,
      readyTimeout: TIMEOUT_MS,
      hostVerifier: (key: Buffer) => {
        const line = hostKeyLine(key);
        onKey(line);
        return !c.hostKey || line === c.hostKey;
      },
    };
    if (c.hostKey) {
      config.algorithms = {
        serverHostKey: hostKeyAlgorithms(c.hostKey) as NonNullable<
          ConnectConfig["algorithms"]
        >["serverHostKey"],
      };
    }
    conn.connect(config);
  });
}

const call = <T>(fn: (cb: (err: Error | null | undefined, v?: T) => void) => void) =>
  new Promise<T>((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v as T))));

/** Berhasil → kunci host yang dilihat; gagal → pesan untuk admin. */
export async function probeOffsite(
  c: ParsedOffsite,
): Promise<{ ok: true; hostKey: string } | { ok: false; message: string }> {
  const conn = new Client();
  let seen = "";
  // Operasi SFTP tidak punya batas waktu sendiri: NAS yang macet setelah login tidak boleh menggantung aksi.
  const timer = setTimeout(() => conn.destroy(), TIMEOUT_MS * 2);
  try {
    const sftp = await connect(conn, c, (line) => (seen = line));
    const st = await call<Stats>((cb) => sftp.stat(c.folder, cb));
    if (!st.isDirectory()) throw new ProbeError(`${c.folder} di NAS bukan folder.`);
    await call((cb) => sftp.readdir(c.folder, cb));
    const file = `${c.folder}/.uji-koneksi-${Date.now()}`;
    await call((cb) => sftp.writeFile(file, "ok", cb));
    const got = await call<Buffer>((cb) => sftp.readFile(file, cb));
    if (got.toString() !== "ok") throw new ProbeError("File uji terbaca tetapi isinya berbeda.");
    await call((cb) => sftp.unlink(file, cb));
    return { ok: true, hostKey: seen };
  } catch (e) {
    return { ok: false, message: probeMessage(e, c, seen) };
  } finally {
    clearTimeout(timer);
    conn.end();
  }
}
