"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const url_1 = require("url");
const next_1 = __importDefault(require("next"));
const ws_1 = require("ws");
const ws_broadcaster_1 = require("./src/lib/ws-broadcaster");
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);
const app = (0, next_1.default)({ dev, hostname, port });
const handle = app.getRequestHandler();
app.prepare().then(() => {
    const server = (0, http_1.createServer)((req, res) => {
        const parsedUrl = (0, url_1.parse)(req.url ?? "/", true);
        handle(req, res, parsedUrl).catch((err) => {
            console.error("Next.js handler error:", err);
            res.statusCode = 500;
            res.end("Internal Server Error");
        });
    });
    // ─── Attach WebSocket server ──────────────────────────────────────────────
    const wss = new ws_1.WebSocketServer({ noServer: true });
    (0, ws_broadcaster_1.setWebSocketServer)(wss);
    // Use noServer mode + only intercept our custom WS path.
    // We must use "upgrade" event but only handle /api/ws ourselves.
    // Next.js 15 in dev mode uses its own HMR WebSocket — we don't touch those.
    server.on("upgrade", (req, socket, head) => {
        const { pathname } = (0, url_1.parse)(req.url ?? "/", true);
        if (pathname === "/api/ws") {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req);
            });
        }
        // Explicitly do NOT destroy or handle other upgrade requests.
        // If we don't handle them, any other registered listeners will get them.
    });
    server.listen(port, hostname, () => {
        console.log(`> SolFlow ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port} (${dev ? "dev" : "prod"})`);
    });
});
