// apps/web/src/lib/ws-broadcaster.ts
// Server-side WebSocket broadcaster.
// Holds the reference to the ws.WebSocketServer so the BullMQ worker
// can broadcast messages to all subscribers of a project/job.
//
// This module is server-only — never import it from client components.

import type { WebSocket, WebSocketServer } from "ws";
import type { WSMessage } from "./ws";

// ─── Singleton WebSocketServer reference ─────────────────────────────────────
// Populated by the custom server (server.ts) after the wss is created.

let wss: WebSocketServer | null = null;

// Map jobId → Set of subscriber WebSocket connections
const jobSubscribers = new Map<string, Set<WebSocket>>();

export function setWebSocketServer(server: WebSocketServer): void {
  wss = server;

  wss.on("connection", (ws: WebSocket) => {
    let subscribedJobs: string[] = [];

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: "subscribe";
          jobId: string;
        };
        if (msg.type === "subscribe" && msg.jobId) {
          if (!jobSubscribers.has(msg.jobId)) {
            jobSubscribers.set(msg.jobId, new Set());
          }
          jobSubscribers.get(msg.jobId)!.add(ws);
          subscribedJobs.push(msg.jobId);
        }
      } catch {
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
export function broadcastToJob(jobId: string, msg: WSMessage): void {
  const payload = JSON.stringify(msg);
  const subs = jobSubscribers.get(jobId);
  if (subs && subs.size > 0) {
    for (const ws of subs) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(payload);
      }
    }
  } else if (wss) {
    // Fall back to broadcast to all (e.g., during development)
    wss.clients.forEach((ws) => {
      if (ws.readyState === 1) ws.send(payload);
    });
  }
}

/**
 * Broadcast to all connected WebSocket clients (project-agnostic).
 */
export function broadcastAll(msg: WSMessage): void {
  if (!wss) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(payload);
  });
}
