#!/usr/bin/env node
// Service account aplikasi berpolicy prefix (T-023 AC5, least privilege), lewat API admin RustFS
// /rustfs/admin/v3 (JSON biasa, SigV4 service "s3" dengan akun root; alias /minio/admin/v3 butuh
// enkripsi madmin — tidak dipakai). Idempoten, dijalankan service storage-init setiap deploy:
//   1. policy "dashboard-app" ditimpa: objek di raw/ parquet/ exports/ guides/ + list hanya dengan
//      prefix itu (tanpa CreateBucket/PutBucketCors/Policy, tanpa list seluruh bucket);
//   2. user S3_APP_ACCESS_KEY dibuat/diperbarui dengan secret S3_APP_SECRET_KEY (8–40 karakter);
//   3. policy dipasang ke user (attach idempoten di RustFS).
// Lalu diverifikasi: user bisa PUT/DELETE di raw/, ditolak di luar prefix. Tidak mencetak kredensial.
// Diuji pada RustFS 1.0.1 (digest di docker-compose.prod.yml); uji ulang setelah upgrade RustFS.
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SignatureV4 } from "@smithy/signature-v4";

const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} belum diisi`);
  return v;
};
const endpoint = need("S3_ENDPOINT");
const region = process.env.S3_REGION ?? "us-east-1";
const Bucket = need("S3_BUCKET");
const root = { accessKeyId: need("S3_ACCESS_KEY"), secretAccessKey: need("S3_SECRET_KEY") };
const app = { accessKeyId: need("S3_APP_ACCESS_KEY"), secretAccessKey: need("S3_APP_SECRET_KEY") };
if (app.secretAccessKey.length < 8 || app.secretAccessKey.length > 40)
  throw new Error("S3_APP_SECRET_KEY wajib 8–40 karakter (batas RustFS)");
const POLICY = "dashboard-app";
const PREFIXES = ["raw", "parquet", "exports", "guides"];

class Sha256 {
  constructor(key) {
    this.h = key ? createHmac("sha256", Buffer.from(key)) : createHash("sha256");
  }
  update(d) {
    this.h.update(Buffer.from(d));
  }
  async digest() {
    return new Uint8Array(this.h.digest());
  }
}
const signer = new SignatureV4({
  service: "s3",
  region,
  sha256: Sha256,
  uriEscapePath: false,
  credentials: root,
});

async function admin(method, pathAndQuery, body) {
  const u = new URL(`/rustfs/admin/v3/${pathAndQuery}`, endpoint);
  const headers = {
    host: u.host,
    ...(body === undefined ? {} : { "content-type": "application/json" }),
  };
  const signed = await signer.sign({
    method,
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    path: u.pathname,
    query: Object.fromEntries(u.searchParams),
    headers,
    body,
  });
  const res = await fetch(u, { method, headers: signed.headers, body });
  if (!res.ok)
    throw new Error(`${method} ${u.pathname} → ${res.status} ${(await res.text()).slice(0, 200)}`);
}

const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "AppObjects",
      Effect: "Allow",
      Action: [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts",
      ],
      Resource: PREFIXES.map((p) => `arn:aws:s3:::${Bucket}/${p}/*`),
    },
    {
      Sid: "AppList",
      Effect: "Allow",
      Action: ["s3:ListBucket", "s3:ListBucketMultipartUploads"],
      Resource: [`arn:aws:s3:::${Bucket}`],
      Condition: { StringLike: { "s3:prefix": PREFIXES.map((p) => `${p}/*`) } },
    },
  ],
};

await admin("PUT", `add-canned-policy?name=${POLICY}`, JSON.stringify(policy));
await admin(
  "PUT",
  `add-user?accessKey=${encodeURIComponent(app.accessKeyId)}`,
  JSON.stringify({ secretKey: app.secretAccessKey, status: "enabled" }),
);
await admin(
  "POST",
  "idp/builtin/policy/attach",
  JSON.stringify({ policies: [POLICY], user: app.accessKeyId }),
);

// Verifikasi: boleh di prefix aplikasi, ditolak di luar.
const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: app,
});
const Key = `raw/_iam-check/${randomBytes(6).toString("hex")}`;
await s3.send(new PutObjectCommand({ Bucket, Key, Body: "ok" }));
await s3.send(new DeleteObjectCommand({ Bucket, Key }));
await s3.send(new ListObjectsV2Command({ Bucket, Prefix: "guides/", MaxKeys: 1 }));
const denied = await s3
  .send(
    new PutObjectCommand({
      Bucket,
      Key: `_luar-prefix/${randomBytes(6).toString("hex")}`,
      Body: "x",
    }),
  )
  .then(
    () => false,
    (e) => e?.$metadata?.httpStatusCode === 403,
  );
if (!denied)
  throw new Error("service account app TIDAK dibatasi prefix (PUT di luar prefix diterima)");
console.log(
  `service account app siap: policy ${POLICY} (prefix ${PREFIXES.join(", ")}), di luar prefix ditolak`,
);
