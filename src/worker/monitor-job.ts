import { currentBackupAlert } from "@/features/backup/service";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { runHealthChecks } from "@/lib/health";
import { infraChecks } from "@/lib/health/checks";
import { logger } from "@/lib/logger";
import { mailFrom, mailer } from "@/lib/mail";
import { alertMail, collectProblems, decideAlert, type MonitorState } from "@/lib/monitor";
import { redisReady } from "@/lib/redis";

/** Status pantauan + daftar admin terakhir di Redis (satu untuk semua replika; job dijadwalkan sekali). */
const STATE_KEY = "monitor:alert-state";
const ADMINS_KEY = "monitor:admins";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function parseState(raw: string | null): MonitorState | null {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<MonitorState>) : null;
    return v && typeof v.sig === "string" && typeof v.sentAt === "number"
      ? { sig: v.sig, sentAt: v.sentAt }
      : null;
  } catch {
    return null;
  }
}

/**
 * Penerima: admin aktif dari database (disimpan juga di Redis). Database mati = justru peringatan
 * terpenting → pakai daftar terakhir yang tersimpan.
 */
async function recipients(r: Awaited<ReturnType<typeof redisReady>>): Promise<string[]> {
  try {
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, isActive: true },
      select: { email: true },
    });
    const to = admins.map((a) => a.email);
    await r.set(ADMINS_KEY, JSON.stringify(to));
    return to;
  } catch (e) {
    logger.warn({ err: errText(e) }, "daftar admin tidak terbaca, memakai daftar tersimpan");
    try {
      const v = JSON.parse((await r.get(ADMINS_KEY)) ?? "[]") as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
}

/** Job pantauan (T-8g53): kumpulkan masalah, putuskan kirim, email admin aktif. */
export async function runMonitor(now = Date.now()) {
  const since = new Date(now - 60 * 60 * 1000);
  const [report, backup, failed] = await Promise.all([
    runHealthChecks(infraChecks()),
    currentBackupAlert(),
    // Database mati: dilaporkan oleh pemeriksaan PostgreSQL; hitungan unggahan gagal dilewati.
    prisma.datasetVersion
      .count({ where: { status: "FAILED", updatedAt: { gte: since } } })
      .catch(() => 0),
  ]);
  const problems = collectProblems({
    health: report.items,
    backup: backup && backup.tone === "error" ? backup : null,
    failedUploadsLastHour: failed,
  });
  const r = await redisReady();
  // Tiap putaran: daftar admin disegarkan selagi database hidup (cadangan saat database mati).
  const to = await recipients(r);
  const d = decideAlert(parseState(await r.get(STATE_KEY)), problems, now);
  if (d.send) {
    if (!to.length) {
      logger.warn({ kind: d.send }, "pantauan: tidak ada admin aktif untuk dikirimi email");
    } else {
      const m = alertMail(d.send, problems, env().APP_URL);
      try {
        await mailer().sendMail({ from: mailFrom(), to, subject: m.subject, text: m.text });
        logger.warn(
          { kind: d.send, problems: problems.map((p) => p.key) },
          "email pantauan dikirim",
        );
      } catch (e) {
        // SMTP mati: jangan simpan status agar dicoba lagi 15 menit kemudian.
        logger.error({ err: errText(e) }, "email pantauan gagal");
        return { problems: problems.length, sent: false };
      }
    }
  }
  await r.set(STATE_KEY, JSON.stringify(d.state));
  return { problems: problems.length, sent: d.send };
}
