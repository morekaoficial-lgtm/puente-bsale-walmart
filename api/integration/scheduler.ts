import { getIntegrationConfig } from "./config";
import { executeSync, getSettings, isSyncRunning, recentRuns } from "./sync";
import { log } from "../lib/logger";

let timer: ReturnType<typeof setInterval> | null = null;

export function startScheduler() {
  if (timer || process.env.DISABLE_SCHEDULER === "true") return;
  timer = setInterval(async () => {
    try {
      const settings = await getSettings();
      if (!settings.autoSyncEnabled || isSyncRunning()) return;
      const latest = (await recentRuns(1))[0];
      const elapsed = latest?.startedAt ? Date.now() - latest.startedAt.getTime() : Number.POSITIVE_INFINITY;
      if (elapsed < settings.intervalMinutes * 60_000) return;
      const mode = getIntegrationConfig().syncMode;
      log.info("Iniciando sincronización programada", { mode });
      await executeSync({ mode, trigger: "scheduled" });
    } catch (error) {
      log.error("Error en sincronización programada", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, 60_000);
  timer.unref();
}
