import { expect, test } from "@playwright/test";

/*
 * Sengaja di project Playwright terpisah (dependencies: e2e) sehingga berjalan paling akhir
 * karena mengisi bucket rate limit IP 'local' (dev tanpa proxy) sehingga login lain akan 429.
 */
test("rate limit: Route Handler login menjawab 429 setelah 10 kegagalan per IP", async ({
  request,
}) => {
  let last = 0;
  for (let i = 0; i < 11; i++) {
    const res = await request.post("/api/auth/login", {
      data: { email: `rl-${i}@pcpexpress.com`, password: "salah-salah-salah" },
    });
    last = res.status();
  }
  expect(last).toBe(429);
});
