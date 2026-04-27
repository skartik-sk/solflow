import { startExecutionWorker, stopExecutionWorker } from "./src/server/execution-worker/queue";
import { startCronWorker, stopCronWorker } from "./src/server/trigger-manager/cron-worker";
import { getTriggerManager } from "./src/server/trigger-manager";
import { getCloudRuntimeMode, logCloudRuntimeEvent } from "./src/server/runtime-mode";

async function startWorkerRuntime(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for SolStudio Cloud workers");
  }

  startExecutionWorker();
  startCronWorker();
  await getTriggerManager().restoreActiveTriggers();

  logCloudRuntimeEvent("worker_ready", {
    pid: process.pid,
    mode: getCloudRuntimeMode(),
  });
}

async function shutdown(signal: string): Promise<void> {
  logCloudRuntimeEvent("worker_shutdown_requested", { signal });
  await Promise.allSettled([
    stopCronWorker(),
    stopExecutionWorker(),
    getTriggerManager().shutdown(),
  ]);
  process.exit(0);
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

startWorkerRuntime().catch((error) => {
  console.error("[cloud-worker] Failed to start:", error);
  process.exit(1);
});
