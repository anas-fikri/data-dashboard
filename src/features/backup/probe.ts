import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ParsedOffsite } from "./config";

/*
 * Tes koneksi target off-VM dari server aplikasi (T-7psf): daftar → tulis → baca → hapus satu objek
 * kecil — hak yang dipakai backup.sh (rclone copy/delete mendaftar isi bucket, lalu salin + retensi). Hanya kelas galat yang dikembalikan ke admin,
 * bukan isi respons, agar fitur ini tidak jadi alat membaca layanan internal lain.
 */

const TIMEOUT_MS = 15_000;

/** Pesan yang bisa ditindak dari galat SDK/jaringan. */
export function probeMessage(e: unknown): string {
  const err = e as { name?: string; Code?: string; code?: string; cause?: { code?: string } };
  const code = err.Code ?? err.name ?? "";
  const net = err.code ?? err.cause?.code ?? "";
  if (code === "NoSuchBucket") return "Bucket tidak ditemukan. Buat dulu bucket-nya di server S3.";
  if (code === "InvalidAccessKeyId" || code === "SignatureDoesNotMatch") {
    return "Access key atau secret ditolak.";
  }
  if (code === "AccessDenied" || code === "Forbidden") {
    return "Kunci ini tidak punya hak mendaftar, menulis, membaca, dan menghapus di bucket tersebut.";
  }
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/.test(net)) {
    return "Sertifikat TLS endpoint tidak dipercaya (mis. self-signed). Pakai sertifikat yang valid atau endpoint http:// di jaringan internal.";
  }
  if (
    code === "TimeoutError" ||
    code === "AbortError" ||
    [
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ECONNRESET",
      "EHOSTUNREACH",
      "ENETUNREACH",
    ].includes(net)
  ) {
    return "Tidak bisa terhubung ke endpoint dari server aplikasi (jaringan, firewall, atau DNS). Pastikan server bisa menjangkau alamat ini.";
  }
  return `Tes gagal (${code || net || "galat tidak dikenal"}).`;
}

export async function probeOffsite(c: ParsedOffsite): Promise<string | null> {
  const client = new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    maxAttempts: 1,
    requestHandler: { connectionTimeout: TIMEOUT_MS, requestTimeout: TIMEOUT_MS },
  });
  const Key = `${c.prefix ? `${c.prefix}/` : ""}.uji-koneksi-${Date.now()}`;
  const opts = () => ({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
  try {
    await client.send(
      // Prefix berakhiran "/" seperti rclone (kunci yang dibatasi ke "folder/*" tetap lolos).
      new ListObjectsV2Command({
        Bucket: c.bucket,
        Prefix: c.prefix ? `${c.prefix}/` : undefined,
        MaxKeys: 1,
      }),
      opts(),
    );
    await client.send(
      new PutObjectCommand({ Bucket: c.bucket, Key, Body: "ok", ContentType: "text/plain" }),
      opts(),
    );
    const got = await client.send(new GetObjectCommand({ Bucket: c.bucket, Key }), opts());
    if ((await got.Body?.transformToString()) !== "ok")
      return "Objek uji terbaca tetapi isinya berbeda.";
    await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key }), opts());
    return null;
  } catch (e) {
    return probeMessage(e);
  } finally {
    client.destroy();
  }
}
