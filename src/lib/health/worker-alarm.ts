import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mailFrom, mailer } from "@/lib/mail";
import { ingestWorkerCount } from "@/lib/queue/versions";
import { redisReady } from "@/lib/redis";
import { decideWorkerAlarm, parseWorkerAlarm, workerAlarmMail } from "./worker-alarm-core";

/** Status + kunci giliran di Redis: beberapa proses app tidak mengirim email ganda. */
const STATE_KEY = "monitor:worker-alarm";
const LOCK_KEY = "monitor:worker-alarm:lock";
const CHECK_MS = 60_000;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const g = globalThis as { __workerAlarm?: NodeJS.Timeout };

/** Satu putaran (T-r5tm). Email gagal → status tidak disimpan, dicoba lagi menit berikutnya. */
export async function checkWorkerAlarm(now = Date.now()): Promise<void> {
  const r = await redisReady();
  // Satu proses per menit (lock kedaluwarsa sendiri, tanpa dilepas).
  if ((await r.set(LOCK_KEY, String(now), "PX", CHECK_MS - 5_000, "NX")) !== "OK") return;
  const prev = parseWorkerAlarm(await r.get(STATE_KEY));
  const d = decideWorkerAlarm(prev, await ingestWorkerCount(), now);
  if (d.send) {
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, isActive: true },
      select: { email: true },
    });
    const to = admins.map((a) => a.email);
    if (to.length) {
      const m = workerAlarmMail(
        d.send,
        d.send === "alert" ? d.state.downSince : prev.downSince,
        now,
        env().APP_URL,
      );
      try {
        await mailer().sendMail({ from: mailFrom(), to, subject: m.subject, text: m.text });
        logger.warn({ kind: d.send }, "email alarm worker dikirim");
      } catch (e) {
        logger.error({ err: errText(e) }, "email alarm worker gagal");
        return;
      }
    } else {
      logger.warn({ kind: d.send }, "alarm worker: tidak ada admin aktif untuk dikirimi email");
    }
  }
  await r.set(STATE_KEY, JSON.stringify(d.state));
}

/** Dipasang sekali dari instrumentation (proses app produksi). Galat tiap putaran hanya dicatat. */
export function startWorkerAlarm(): void {
  // Hanya produksi: dev/e2e sering berjalan tanpa worker dan memakai Mailpit untuk tes email.
  if (g.__workerAlarm || process.env.NODE_ENV !== "production") return;
  const tick = () =>
    void checkWorkerAlarm().catch((e: unknown) =>
      logger.warn({ err: errText(e) }, "pemeriksaan alarm worker gagal"),
    );
  g.__workerAlarm = setInterval(tick, CHECK_MS);
  g.__workerAlarm.unref();
}
