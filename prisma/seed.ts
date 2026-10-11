import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const emailSchema = z.string().email();

/**
 * Seed admin pertama dari SEED_ADMIN_EMAIL. Idempoten: jika sudah ada, hanya
 * memastikan isAdmin dan isActive. Tidak membuat password; akun belum bisa login
 * (passwordHash null → T-002 wajib menolak) sampai admin menetapkannya lewat alur reset (T-026).
 */
export async function seedAdmin(
  prisma: PrismaClient,
  email: string | undefined,
  allowedDomains: string[],
) {
  if (!email) throw new Error("SEED_ADMIN_EMAIL belum diisi; seed admin dilewati.");
  const normalized = emailSchema.parse(email.trim().toLowerCase());
  const domain = normalized.split("@")[1] ?? "";
  if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
    throw new Error(
      `SEED_ADMIN_EMAIL domain '${domain}' tidak ada di ALLOWED_EMAIL_DOMAINS (${allowedDomains.join(", ")})`,
    );
  }
  return prisma.user.upsert({
    where: { email: normalized },
    create: { email: normalized, isAdmin: true, isActive: true, emailVerifiedAt: new Date() },
    update: { isAdmin: true, isActive: true },
  });
}

export function parseDomains(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const admin = await seedAdmin(
      prisma,
      process.env.SEED_ADMIN_EMAIL,
      parseDomains(process.env.ALLOWED_EMAIL_DOMAINS),
    );
    console.log(`Admin siap: ${admin.email} (id ${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

// Hanya jalan saat dieksekusi langsung (tsx prisma/seed.ts), tidak saat di-import test.
if (process.argv[1]?.endsWith("seed.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
