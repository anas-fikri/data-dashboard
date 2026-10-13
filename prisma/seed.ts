import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const emailSchema = z.string().email();

/**
 * Seed admin pertama dari SEED_ADMIN_EMAIL. Idempoten: peran admin dan status aktif hanya diisi
 * saat akun DIBUAT. Akun yang sudah ada tidak diubah sama sekali, agar seed ulang tidak membatalkan
 * pencabutan admin atau penonaktifan yang dilakukan lewat /admin/pengguna (T-019). Tidak membuat
 * password; akun belum bisa login (passwordHash null → T-002 wajib menolak) sampai admin
 * menetapkannya lewat alur reset (T-026).
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
    update: {},
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
    if (admin.isAdmin && admin.isActive) {
      console.log(`Admin siap: ${admin.email} (id ${admin.id})`);
    } else {
      console.warn(
        `${admin.email} sudah ada tetapi bukan admin aktif; seed tidak mengubahnya (T-019). ` +
          "Pulihkan lewat /admin/pengguna oleh admin lain.",
      );
    }
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
