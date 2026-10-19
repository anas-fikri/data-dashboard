import "server-only";
import { Client, type ConnectConfig, type SFTPWrapper, type Stats } from "ssh2";
import { logger } from "@/lib/logger";
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
const FAILURE = 4;

// File uji 64 KB, bukan beberapa byte: Btrfs menyimpan file ≤ ±2 KB inline di metadata, jadi file kecil tetap
// masuk walau ruang/kuota NAS habis — tes harus gagal seperti backup sungguhan (T-h77x).
const PROBE_DATA = Buffer.alloc(64 * 1024, "uji koneksi data-dashboard\n");
const CHUNK = 32 * 1024;

/** Langkah tes koneksi, disebut di pesan galat SFTP. */
const STEPS = {
  stat: "membuka folder",
  readdir: "mendaftar isi folder",
  write: "menulis file uji",
  rename: "mengganti nama file uji",
  read: "membaca file uji",
  unlink: "menghapus file uji",
} as const;

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
  step = "",
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
  if (err.code === NO_SUCH_FILE && (!step || step === STEPS.stat)) {
    return `Folder ${c.folder} tidak ditemukan di NAS. Buat dulu lewat File Station; folder diawali nama shared folder, mis. /backup-data-dashboard.`;
  }
  if (err.code === PERMISSION_DENIED) {
    return `Akun ini tidak punya izin ${step || "baca/tulis"} di folder tersebut. Atur di DSM: Panel Kontrol › Folder Bersama › Edit › Izin (baca, tulis, dan hapus).`;
  }
  if (typeof err.code === "number" && step) {
    // Status SFTP lain (mis. 4 = FAILURE): sebut langkahnya + pesan singkat dari NAS agar bisa ditindak.
    const said = (err.message ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, 120);
    if (step === STEPS.write && err.code === FAILURE) {
      return `NAS menolak saat ${step} (kode SFTP ${err.code}${said ? `: ${said}` : ""}). Biasanya ruang penyimpanan NAS penuh atau kuota akun/folder habis — periksa DSM: Storage Manager, Panel Kontrol › Pengguna › Kuota, dan Folder Bersama › Edit › Kuota; juga izin tulis akun di folder ini.`;
    }
    return `NAS menolak saat ${step} (kode SFTP ${err.code}${said ? `: ${said}` : ""}). Periksa izin akun di folder ini (baca, tulis, dan hapus) di DSM: Panel Kontrol › Folder Bersama › Edit › Izin.`;
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
      conn.sftp((err, sftp) => {
        if (!err) return resolve(sftp);
        // Alasan dari server (mis. "Unable to start subsystem: sftp") hanya ke log operator, bukan ke admin.
        logger.warn({ host: c.host, port: c.port, err: err.message }, "subsistem SFTP ditolak NAS");
        reject(
          new ProbeError(
            "Login berhasil, tetapi NAS menolak SFTP untuk akun atau port ini. Periksa di DSM: SFTP aktif dengan nomor port yang sama dengan Port SFTP di sini (Panel Kontrol › Layanan File › FTP › SFTP), dan akun ini diizinkan memakai SFTP (Panel Kontrol › Hak Istimewa Aplikasi › SFTP).",
          ),
        );
      }),
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
  let step = "";
  let sftp: SFTPWrapper | undefined;
  const made: string[] = [];
  // Operasi SFTP tidak punya batas waktu sendiri: NAS yang macet setelah login tidak boleh menggantung aksi.
  const timer = setTimeout(() => conn.destroy(), TIMEOUT_MS * 2);
  try {
    const s = (sftp = await connect(conn, c, (line) => (seen = line)));
    step = STEPS.stat;
    const st = await call<Stats>((cb) => s.stat(c.folder, cb));
    if (!st.isDirectory()) throw new ProbeError(`${c.folder} di NAS bukan folder.`);
    step = STEPS.readdir;
    await call((cb) => s.readdir(c.folder, cb));
    // Seperti rclone sftp (set_modtime=false): buka TANPA atribut izin (DSM menolak chmod di folder ber-ACL),
    // tulis ke .partial, lalu ganti nama.
    const file = `${c.folder}/.uji-koneksi-${Date.now()}`;
    const partial = `${file}.partial`;
    step = STEPS.write;
    made.push(partial);
    const handle = await call<Buffer>((cb) => s.open(partial, "w", cb));
    for (let off = 0; off < PROBE_DATA.length; off += CHUNK) {
      const len = Math.min(CHUNK, PROBE_DATA.length - off);
      await call((cb) => s.write(handle, PROBE_DATA, off, len, off, cb));
    }
    await call((cb) => s.close(handle, cb));
    step = STEPS.rename;
    await call((cb) => s.rename(partial, file, cb));
    made.splice(0, 1, file);
    step = STEPS.read;
    // readFile ssh2 juga membuka dengan atribut mode → baca manual tanpa atribut.
    const rh = await call<Buffer>((cb) => s.open(file, "r", cb));
    const got = Buffer.alloc(PROBE_DATA.length);
    let pos = 0;
    while (pos < got.length) {
      const at = pos;
      const n = await call<number>((cb) =>
        s.read(rh, got, at, Math.min(CHUNK, got.length - at), at, (err, bytes) => cb(err, bytes)),
      );
      if (!n) break;
      pos += n;
    }
    await call((cb) => s.close(rh, cb));
    if (pos !== PROBE_DATA.length || !got.equals(PROBE_DATA))
      throw new ProbeError("File uji terbaca tetapi isinya berbeda.");
    step = STEPS.unlink;
    await call((cb) => s.unlink(file, cb));
    made.length = 0;
    return { ok: true, hostKey: seen };
  } catch (e) {
    // File uji yang sempat dibuat jangan tertinggal di NAS (abaikan galat; batas waktu tetap berlaku).
    for (const f of made) {
      await new Promise<void>((done) => {
        setTimeout(done, 3_000);
        if (sftp) sftp.unlink(f, () => done());
        else done();
      });
    }
    const err = e as { code?: unknown; message?: string };
    if (step && typeof err.code === "number") {
      logger.warn(
        { host: c.host, port: c.port, step, code: err.code, err: err.message },
        "operasi SFTP tes koneksi ditolak NAS",
      );
    }
    return { ok: false, message: probeMessage(e, c, seen, step) };
  } finally {
    clearTimeout(timer);
    conn.end();
  }
}
