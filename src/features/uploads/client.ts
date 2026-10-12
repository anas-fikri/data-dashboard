/*
 * Mesin unggah di browser (flow-kerja B2): pra-cek 64 KB → init (atau resume) → part paralel ke
 * storage lewat presigned URL → complete. Part yang sudah ada di storage dilewati, jadi memilih file
 * yang sama setelah muat ulang/putus melanjutkan dari bagian terakhir.
 */
import { expectedPartSize, partRange } from "./parts";
import { SNIFF_BYTES, kindOf, sniff } from "./sniff";

const CONCURRENCY = 4;
const SIGN_CHUNK = 8;
const RETRIES = 4;

export type UploadPhase = "checking" | "uploading" | "finishing";

export interface UploadProgress {
  phase: UploadPhase;
  loaded: number;
  total: number;
  resumed: boolean;
  versionId?: string;
}

export class UploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly versionId?: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const NETWORK_MESSAGE =
  "Koneksi terputus. Pilih file yang sama untuk melanjutkan dari bagian terakhir.";

interface ApiOk {
  ok: true;
  [k: string]: unknown;
}

async function api<T extends ApiOk>(
  path: string,
  method: "POST" | "DELETE",
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new UploadError("NETWORK", NETWORK_MESSAGE);
  }
  const data = (await res.json().catch(() => null)) as
    | (T & { code?: string; message?: string; missing?: number[] })
    | { ok: false; code?: string; message?: string; missing?: number[] }
    | null;
  if (!res.ok || !data || !data.ok) {
    if (res.status === 401) {
      throw new UploadError(
        "UNAUTHENTICATED",
        "Sesi berakhir. Masuk lagi, lalu pilih file yang sama untuk melanjutkan.",
      );
    }
    const err = new UploadError(
      data?.code ?? "NETWORK",
      data?.message ?? "Terjadi gangguan. Coba lagi beberapa saat lagi.",
    );
    (err as UploadError & { missing?: number[] }).missing = data?.missing;
    throw err;
  }
  return data as T;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** PUT satu part dengan progres (XHR: fetch belum punya progres unggah). */
function putPart(
  url: string,
  blob: Blob,
  onLoaded: (bytes: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    xhr.onload = () => {
      signal.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`status ${xhr.status}`));
    };
    xhr.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error("network"));
    };
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.send(blob);
  });
}

export interface UploadOptions {
  file: File;
  datasetId: string;
  maxBytes: number;
  signal: AbortSignal;
  onProgress: (p: UploadProgress) => void;
}

interface InitResponse extends ApiOk {
  versionId: string;
  partSize: number;
  partCount: number;
  uploadedParts: number[];
  resumed: boolean;
}

interface SignResponse extends ApiOk {
  urls: { partNumber: number; url: string; size: number }[];
}

/** Pra-cek lokal (UX): ekstensi, ukuran, signature 64 KB pertama. Server memeriksa ulang. */
export async function precheck(file: File, maxBytes: number): Promise<void> {
  const kind = kindOf(file.name);
  if (!kind)
    throw new UploadError("INVALID_FORMAT", "Hanya file .xlsx atau .csv yang bisa diunggah.");
  if (file.size > maxBytes) {
    throw new UploadError(
      "FILE_TOO_LARGE",
      `Ukuran file melebihi batas ${formatBytes(maxBytes)}. Pecah data menjadi beberapa file atau hapus kolom yang tidak dipakai.`,
    );
  }
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const r = sniff(kind, head);
  if (!r.ok) throw new UploadError("INVALID_FORMAT", r.message);
}

export async function uploadFile(opts: UploadOptions): Promise<{ versionId: string }> {
  const { file, datasetId, maxBytes, signal, onProgress } = opts;
  onProgress({ phase: "checking", loaded: 0, total: file.size, resumed: false });
  await precheck(file, maxBytes);

  const init = await api<InitResponse>(
    "/api/uploads",
    "POST",
    { datasetId, name: file.name, size: file.size, lastModified: file.lastModified },
    signal,
  );
  const { versionId, partSize, partCount } = init;
  const size = file.size;
  const done = new Set(init.uploadedParts);
  let loadedDone = 0;
  for (const n of done) loadedDone += expectedPartSize(n, size, partSize, partCount);
  const inflight = new Map<number, number>();
  const emit = () => {
    let sum = loadedDone;
    for (const v of inflight.values()) sum += v;
    onProgress({
      phase: "uploading",
      loaded: Math.min(sum, size),
      total: size,
      resumed: init.resumed,
      versionId,
    });
  };
  emit();

  const sign = async (nums: number[]) =>
    (
      await api<SignResponse>(
        `/api/uploads/${versionId}/parts`,
        "POST",
        { partNumbers: nums },
        signal,
      )
    ).urls;

  const uploadPart = async (n: number, firstUrl: string) => {
    const [start, end] = partRange(n, partSize);
    const blob = file.slice(start, Math.min(end, size));
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        const url = attempt === 0 ? firstUrl : (await sign([n]))[0]!.url;
        await putPart(
          url,
          blob,
          (b) => {
            inflight.set(n, b);
            emit();
          },
          signal,
        );
        inflight.delete(n);
        done.add(n);
        loadedDone += blob.size;
        emit();
        return;
      } catch (e) {
        inflight.delete(n);
        if (signal.aborted) throw e;
        if (e instanceof UploadError && e.code !== "NETWORK") throw e;
        if (attempt === RETRIES - 1) throw new UploadError("NETWORK", NETWORK_MESSAGE, versionId);
        await wait(1000 * 2 ** attempt, signal);
      }
    }
  };

  const uploadAll = async (numbers: number[]) => {
    for (let i = 0; i < numbers.length; i += SIGN_CHUNK) {
      const chunk = numbers.slice(i, i + SIGN_CHUNK);
      const urls = await sign(chunk);
      const queue = [...urls];
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          for (let item = queue.shift(); item; item = queue.shift()) {
            await uploadPart(item.partNumber, item.url);
          }
        }),
      );
    }
  };

  const todo = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !done.has(n));
  await uploadAll(todo);

  // Complete; bila server melaporkan part hilang (mis. tab lain/kegagalan diam), unggah lalu ulangi.
  for (let round = 0; ; round++) {
    onProgress({ phase: "finishing", loaded: size, total: size, resumed: init.resumed, versionId });
    try {
      await api(`/api/uploads/${versionId}/complete`, "POST", {}, signal);
      return { versionId };
    } catch (e) {
      const missing = (e as UploadError & { missing?: number[] }).missing;
      if (e instanceof UploadError && e.code === "INCOMPLETE" && missing?.length && round < 2) {
        for (const n of missing) {
          if (done.delete(n)) loadedDone -= expectedPartSize(n, size, partSize, partCount);
        }
        await uploadAll(missing);
        continue;
      }
      if (e instanceof UploadError) throw new UploadError(e.code, e.message, versionId);
      throw e;
    }
  }
}

export async function cancelUploadRequest(versionId: string): Promise<void> {
  await api(`/api/uploads/${versionId}`, "DELETE", null);
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024)).toLocaleString("id-ID")} KB`;
  if (n < 1024 ** 3)
    return `${(n / 1024 ** 2).toLocaleString("id-ID", { maximumFractionDigits: 0 })} MB`;
  return `${(n / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 1 })} GB`;
}
