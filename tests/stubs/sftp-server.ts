import {
  closeSync,
  fstatSync,
  openSync,
  readdirSync,
  readSync,
  statSync,
  unlinkSync,
  writeSync,
  type Stats,
} from "node:fs";
import type { AddressInfo } from "node:net";
import { join, posix } from "node:path";
import { Server, utils, type Connection, type SFTPWrapper } from "ssh2";

/*
 * Server SFTP kecil di dalam proses tes (T-y8qq) untuk tes koneksi NAS: login password, kunci host
 * ed25519 baru tiap start, file nyata di folder sementara. Hanya operasi yang dipakai probe (stat,
 * opendir/readdir, open/write/read/fstat/close, remove).
 */

const { STATUS_CODE } = utils.sftp;

export interface FakeSftp {
  port: number;
  /** Kunci publik host ("ssh-ed25519 AAAA…") seperti yang dipin aplikasi. */
  hostKey: string;
  /** Berapa kali klien mengirim password (kunci host ditolak → password tidak boleh terkirim). */
  stats: { passwordAttempts: number };
  close: () => Promise<void>;
}

const attrs = (st: Stats) => ({
  mode: st.mode,
  uid: st.uid,
  gid: st.gid,
  size: st.size,
  atime: Math.floor(st.atimeMs / 1000),
  mtime: Math.floor(st.mtimeMs / 1000),
});

function serve(sftp: SFTPWrapper, root: string, failOp?: string) {
  if (failOp) {
    // Seperti DSM yang menolak satu operasi dengan status umum FAILURE (kode 4).
    const emit = sftp.emit.bind(sftp);
    sftp.emit = ((ev: string, id: number, ...rest: unknown[]) =>
      ev === failOp
        ? sftp.status(id, STATUS_CODE.FAILURE, "Failure")
        : emit(ev, id, ...rest)) as typeof sftp.emit;
  }
  const real = (p: string) => join(root, posix.normalize(`/${p}`));
  const open = new Map<number, { fd?: number; dir?: string[]; path: string }>();
  let next = 0;
  const handle = (h: { fd?: number; dir?: string[]; path: string }) => {
    const id = next++;
    open.set(id, h);
    const b = Buffer.alloc(4);
    b.writeUInt32BE(id);
    return b;
  };
  const get = (b: Buffer) => open.get(b.readUInt32BE(0));
  const fail = (id: number, e: unknown) => {
    const code = (e as NodeJS.ErrnoException).code;
    sftp.status(
      id,
      code === "ENOENT"
        ? STATUS_CODE.NO_SUCH_FILE
        : code === "EACCES"
          ? STATUS_CODE.PERMISSION_DENIED
          : STATUS_CODE.FAILURE,
    );
  };
  const tryDo = (id: number, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      fail(id, e);
    }
  };

  sftp.on("STAT", (id, p) => tryDo(id, () => sftp.attrs(id, attrs(statSync(real(p))))));
  sftp.on("LSTAT", (id, p) => tryDo(id, () => sftp.attrs(id, attrs(statSync(real(p))))));
  sftp.on("FSTAT", (id, h) => tryDo(id, () => sftp.attrs(id, attrs(fstatSync(get(h)!.fd!)))));
  sftp.on("OPENDIR", (id, p) =>
    tryDo(id, () => sftp.handle(id, handle({ dir: readdirSync(real(p)), path: real(p) }))),
  );
  sftp.on("READDIR", (id, h) => {
    const x = get(h);
    if (!x?.dir) return sftp.status(id, STATUS_CODE.FAILURE);
    if (x.dir.length === 0) return sftp.status(id, STATUS_CODE.EOF);
    const names = x.dir.splice(0).map((filename) => ({
      filename,
      longname: filename,
      attrs: attrs(statSync(join(x.path, filename))),
    }));
    sftp.name(id, names);
  });
  sftp.on("OPEN", (id, p, flags) =>
    tryDo(id, () =>
      sftp.handle(
        id,
        handle({ fd: openSync(real(p), utils.sftp.flagsToString(flags) ?? "r"), path: real(p) }),
      ),
    ),
  );
  sftp.on("WRITE", (id, h, offset, data) =>
    tryDo(id, () => {
      writeSync(get(h)!.fd!, data, 0, data.length, offset);
      sftp.status(id, STATUS_CODE.OK);
    }),
  );
  sftp.on("READ", (id, h, offset, length) =>
    tryDo(id, () => {
      const buf = Buffer.alloc(length);
      const n = readSync(get(h)!.fd!, buf, 0, length, offset);
      if (n === 0) sftp.status(id, STATUS_CODE.EOF);
      else sftp.data(id, buf.subarray(0, n));
    }),
  );
  sftp.on("CLOSE", (id, h) =>
    tryDo(id, () => {
      const x = get(h);
      if (x?.fd !== undefined) closeSync(x.fd);
      open.delete(h.readUInt32BE(0));
      sftp.status(id, STATUS_CODE.OK);
    }),
  );
  sftp.on("REMOVE", (id, p) =>
    tryDo(id, () => {
      unlinkSync(real(p));
      sftp.status(id, STATUS_CODE.OK);
    }),
  );
  sftp.on("SETSTAT", (id) => sftp.status(id, STATUS_CODE.OK));
  sftp.on("FSETSTAT", (id) => sftp.status(id, STATUS_CODE.OK));
  sftp.on("REALPATH", (id, p) =>
    sftp.name(id, [
      { filename: posix.normalize(`/${p}`), longname: "", attrs: attrs(statSync(root)) },
    ]),
  );
}

/**
 * Start di 127.0.0.1 port acak (atau `port` untuk mensimulasikan NAS yang diinstal ulang; `listen` untuk
 * dijangkau container, mis. uji rclone sungguhan).
 */
export function startFakeSftp(opts: {
  root: string;
  username: string;
  password: string;
  port?: number;
  listen?: string;
  denySftp?: boolean;
  /** Nama permintaan SFTP (mis. "REMOVE") yang selalu dijawab FAILURE. */
  fail?: string;
}): Promise<FakeSftp> {
  const keys = utils.generateKeyPairSync("ed25519");
  const clients = new Set<Connection>();
  const stats = { passwordAttempts: 0 };
  const server = new Server({ hostKeys: [keys.private] }, (client) => {
    clients.add(client);
    client.on("close", () => clients.delete(client));
    client.on("error", () => {});
    client.on("authentication", (ctx) => {
      if (ctx.method === "password") stats.passwordAttempts++;
      if (
        ctx.method === "password" &&
        ctx.username === opts.username &&
        ctx.password === opts.password
      ) {
        ctx.accept();
      } else {
        ctx.reject(["password"]);
      }
    });
    client.on("ready", () => {
      client.on("session", (accept) => {
        accept().on("sftp", (acceptSftp, rejectSftp) => {
          // Seperti DSM dengan SFTP mati / akun tanpa hak SFTP: login diterima, subsistem ditolak.
          if (opts.denySftp) return rejectSftp();
          const sftp = acceptSftp();
          // Seperti OpenSSH: EOF dari klien → kanal ditutup (rclone menunggu ini saat menutup koneksi).
          sftp.on("end", () => sftp.end());
          serve(sftp, opts.root, opts.fail);
        });
      });
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, opts.listen ?? "127.0.0.1", () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        hostKey: keys.public.split(" ").slice(0, 2).join(" "),
        stats,
        close: () =>
          new Promise((done) => {
            for (const c of clients) c.end();
            server.close(() => done());
          }),
      });
    });
  });
}
