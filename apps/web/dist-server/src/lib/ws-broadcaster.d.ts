import type { WebSocketServer } from "ws";
import type { WSMessage } from "./ws";
export declare function setWebSocketServer(server: WebSocketServer): void;
/**
 * Broadcast a WSMessage to all clients subscribed to a specific job.
 * Also broadcasts to all connected clients if no subscribers map is set.
 */
export declare function broadcastToJob(jobId: string, msg: WSMessage): void;
/**
 * Broadcast to all connected WebSocket clients (project-agnostic).
 */
export declare function broadcastAll(msg: WSMessage): void;
//# sourceMappingURL=ws-broadcaster.d.ts.map