import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { startExecutionWorker } from "./src/server/execution-worker/queue";
import { startCronWorker } from "./src/server/trigger-manager/cron-worker";
import { getTriggerManager } from "./src/server/trigger-manager";
import { logCloudRuntimeEvent, shouldRunWorkersInThisProcess } from "./src/server/runtime-mode";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3001", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function startCloudRuntime(): Promise<void> {
  if (!shouldRunWorkersInThisProcess()) {
    logCloudRuntimeEvent("workers_external");
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.warn(
      "[cloud-startup] Skipping workers/triggers because DATABASE_URL is not configured.",
    );
    return;
  }

  startExecutionWorker();
  startCronWorker();
  await getTriggerManager().restoreActiveTriggers();
  logCloudRuntimeEvent("workers_embedded");
}

app.prepare().then(async () => {
  try {
    await startCloudRuntime();
  } catch (err) {
    console.error("[cloud-startup] Failed to restore workers/triggers:", err);
  }

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl).catch((err: unknown) => {
      console.error("Next.js handler error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    });
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/", true);
    if (pathname === "/api/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  server.listen(port, hostname, () => {
    console.log(
      `> SolStudio Cloud ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port} (${dev ? "dev" : "prod"})`,
    );
  });
});
