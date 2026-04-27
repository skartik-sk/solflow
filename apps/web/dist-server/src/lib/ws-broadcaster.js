"use strict";
// apps/web/src/lib/ws-broadcaster.ts
// Server-side WebSocket broadcaster.
// Holds the reference to the ws.WebSocketServer so the BullMQ worker
// can broadcast messages to all subscribers of a project/job.
//
// This module is server-only — never import it from client components.
Object.defineProperty(exports, "__esModule", { value: true });
exports.setWebSocketServer = setWebSocketServer;
exports.broadcastToJob = broadcastToJob;
exports.broadcastAll = broadcastAll;
// ─── Singleton WebSocketServer reference ─────────────────────────────────────
// Populated by the custom server (server.ts) after the wss is created.
let wss = null;
// Map jobId → Set of subscriber WebSocket connections
const jobSubscribers = new Map();
function setWebSocketServer(server) {
    wss = server;
    // Heartbeat: detect and close stale connections every 30s
    const heartbeat = setInterval(() => {
        wss?.clients.forEach((ws) => {
            const anyWs = ws;
            if (!anyWs.isAlive)
                return ws.terminate();
            anyWs.isAlive = false;
            ws.ping();
        });
    }, 30000);
    heartbeat.unref?.();
    wss.on("close", () => clearInterval(heartbeat));
    wss.on("connection", (ws) => {
        let subscribedJobs = [];
        ws.isAlive = true;
        ws.on("pong", () => { ws.isAlive = true; });
        ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === "subscribe" && msg.jobId) {
                    if (!jobSubscribers.has(msg.jobId)) {
                        jobSubscribers.set(msg.jobId, new Set());
                    }
                    jobSubscribers.get(msg.jobId).add(ws);
                    subscribedJobs.push(msg.jobId);
                }
            }
            catch {
                // Ignore
            }
        });
        ws.on("close", () => {
            for (const jobId of subscribedJobs) {
                jobSubscribers.get(jobId)?.delete(ws);
                if (jobSubscribers.get(jobId)?.size === 0) {
                    jobSubscribers.delete(jobId);
                }
            }
        });
    });
}
/**
 * Broadcast a WSMessage to all clients subscribed to a specific job.
 * Also broadcasts to all connected clients if no subscribers map is set.
 */
function broadcastToJob(jobId, msg) {
    const payload = JSON.stringify(msg);
    const subs = jobSubscribers.get(jobId);
    if (subs && subs.size > 0) {
        for (const ws of subs) {
            if (ws.readyState === 1 /* OPEN */) {
                ws.send(payload);
            }
        }
    }
    else if (wss) {
        // Fall back to broadcast to all (e.g., during development)
        wss.clients.forEach((ws) => {
            if (ws.readyState === 1)
                ws.send(payload);
        });
    }
}
/**
 * Broadcast to all connected WebSocket clients (project-agnostic).
 */
function broadcastAll(msg) {
    if (!wss)
        return;
    const payload = JSON.stringify(msg);
    wss.clients.forEach((ws) => {
        if (ws.readyState === 1)
            ws.send(payload);
    });
}
