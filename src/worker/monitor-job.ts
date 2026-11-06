import { currentBackupAlert } from "@/features/backup/service";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { runHealthChecks } from "@/lib/health";
import { infraChecks } from "@/lib/health/checks";
import { logger } from "@/lib/logger";
import { mailFrom, mailer } from "@/lib/mail";
import { alertMail, collectProblems, decideAlert, type MonitorState } from "@/lib/monitor";
import { redisReady } from "@/lib/redis";

/** Kunci status pantauan di Redis (satu untuk semua replika worker; job dijadwalkan sekali). */
const STATE_KEY = "monitor:alert-state";

/** Job pantauan (T-8g53): kumpulkan masalah, putuskan kirim, email admin aktif. */
export async function runMonitor(now = Date.now()) {
  const since = new Date(now - 60 * 60 * 1000);
  const [report, backup, failed] = await Promise.all([
    runHealthChecks(infraChecks()),
    currentBackupAlert(),
    prisma.datasetVersion.count({ where: { status: "FAILED", updatedAt: { gte: since } } }),
  ]);
  const problems = collectProblems({
    health: report.items,
    backup: backup && backup.tone === "error" ? backup : null,
    failedUploadsLastHour: failed,
  });
  const r = await redisReady();
  const raw = await r.get(STATE_KEY);
  const prev = raw ? (JSON.parse(raw) as MonitorState) : null;
  const d = decideAlert(prev, problems, now);
  if (d.send) {
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, isActive: true },
      select: { email: true },
    });
    const to = admins.map((a) => a.email);
    if (to.length) {
      const m = alertMail(d.send, problems, env().APP_URL);
      try {
        await mailer().sendMail({ from: mailFrom(), to, subject: m.subject, text: m.text });
      } catch (e) {
        // SMTP mati: jangan simpan status agar dicoba lagi 15 menit kemudian.
        logger.error({ err: e instanceof Error ? e.message : String(e) }, "email pantauan gagal");
        return { problems: problems.length, sent: false };
      }
    }
    logger.warn({ kind: d.send, problems: problems.map((p) => p.key) }, "email pantauan dikirim");
  }
  await r.set(STATE_KEY, JSON.stringify(d.state));
  return { problems: problems.length, sent: d.send };
}
