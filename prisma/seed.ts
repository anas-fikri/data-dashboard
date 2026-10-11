import { PrismaClient } from "@prisma/client";

/**
 * Seed admin pertama dari SEED_ADMIN_EMAIL. Idempoten: jika sudah ada, hanya
 * memastikan isAdmin dan isActive. Tidak membuat password; admin menetapkannya
 * lewat alur verifikasi/reset (T-002, T-026).
 */
export async function seedAdmin(prisma: PrismaClient, email: string | undefined) {
  if (!email) {
    throw new Error("SEED_ADMIN_EMAIL belum diisi; seed admin dilewati.");
  }
  const normalized = email.trim().toLowerCase();
  return prisma.user.upsert({
    where: { email: normalized },
    create: { email: normalized, isAdmin: true, isActive: true, emailVerifiedAt: new Date() },
    update: { isAdmin: true, isActive: true },
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const admin = await seedAdmin(prisma, process.env.SEED_ADMIN_EMAIL);
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
