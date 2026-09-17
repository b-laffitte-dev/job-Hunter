import cron from "node-cron";
import { loadEnv } from "../config/index.js";
import { runOnce } from "../runner.js";

export function startScheduler(): void {
  const env = loadEnv();
  if (!cron.validate(env.CRON_SCHEDULE)) {
    throw new Error(`Expression cron invalide: ${env.CRON_SCHEDULE}`);
  }
  console.log(`[scheduler] planifié avec "${env.CRON_SCHEDULE}"`);
  cron.schedule(env.CRON_SCHEDULE, async () => {
    console.log(`[scheduler] déclenchement: ${new Date().toISOString()}`);
    try {
      await runOnce();
    } catch (e) {
      console.error(`[scheduler] run échoué: ${(e as Error).message}`);
    }
  });
}
