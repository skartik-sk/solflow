// apps/web/server.ts
// Custom Next.js server that attaches a ws.WebSocketServer for
// real-time compile/test/deploy log streaming.
//
// Usage (replace `next dev` / `next start`):
//   npx ts-node --project tsconfig.server.json server.ts
//   OR: node --loader ts-node/esm server.ts
//
// In production use:
//   node server.js   (after building with next build + tsc --project tsconfig.server.json)

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { setWebSocketServer } from "./src/lib/ws-broadcaster";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl).catch((err: unknown) => {
      console.error("Next.js handler error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    });
  });

  // ─── Attach WebSocket server ──────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });
  setWebSocketServer(wss);

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/", true);
    if (pathname === "/api/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (pathname?.startsWith("/_next")) {
      // Let Next.js handle HMR and other internal WebSocket upgrades
      handle(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, hostname, () => {
    console.log(
      `> SolFlow ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port} (${dev ? "dev" : "prod"})`,
    );
  });
});
