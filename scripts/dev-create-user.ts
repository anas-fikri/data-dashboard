/*
 * Dev/UAT saja: buat (atau perbarui) akun yang langsung terverifikasi, untuk mencoba aplikasi tanpa
 * alur email. Password dibangkitkan acak dan dicetak sekali (tidak disimpan di tempat lain).
 *   npx tsx --conditions=react-server --env-file-if-exists=.env scripts/dev-create-user.ts <email> [--admin]
 * Domain email tetap harus ada di ALLOWED_EMAIL_DOMAINS. Menolak jalan di produksi.
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/features/auth/password";
import { prisma } from "../src/lib/db";
import { env } from "../src/lib/env";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("ditolak: NODE_ENV=production");
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const isAdmin = process.argv.includes("--admin");
  const domain = email.split("@")[1] ?? "";
  if (!/^[^@\s]+@[^@\s]+$/.test(email))
    throw new Error("pakai: dev-create-user.ts <email> [--admin]");
  if (!env().ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    throw new Error(`domain ${domain} tidak ada di ALLOWED_EMAIL_DOMAINS`);
  }
  const password = randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, isAdmin, emailVerifiedAt: new Date() },
    // sessionVersion naik: sesi lama akun ini dicabut karena password berganti.
    update: {
      passwordHash,
      isAdmin,
      isActive: true,
      emailVerifiedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });
  console.log(JSON.stringify({ email: user.email, admin: user.isAdmin, password }));
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
