// apps/web/src/lib/ws.ts
// WebSocket client helper for streaming compile/test/deploy progress.
// Per docs/architecture/09-compilation-deployment.md → WebSocket Communication.

// ─── Message types ────────────────────────────────────────────────────────────

export interface BuildLogData {
  line: string;
  level: "info" | "warn" | "error";
}

export interface BuildCompleteData {
  success: boolean;
  binarySize?: number;
  errors?: string[];
  warnings?: string[];
}

export interface TestResultData {
  test: string;
  passed: boolean;
  time?: number;
  error?: string;
}

export interface TestCompleteData {
  passed: number;
  failed: number;
  total: number;
  duration: number;
}

export interface DeployStatusData {
  phase:
    | "preparing"
    | "signing"
    | "submitting"
    | "confirming"
    | "complete"
    | "error";
  txSig?: string;
  programId?: string;
  explorerUrl?: string;
  error?: string;
}

export type WSMessageData =
  | BuildLogData
  | BuildCompleteData
  | TestResultData
  | TestCompleteData
  | DeployStatusData;

export interface WSMessage {
  type:
    | "build-log"
    | "build-complete"
    | "test-result"
    | "test-complete"
    | "deploy-status";
  jobId: string;
  data: WSMessageData;
}

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isBuildLog(
  msg: WSMessage,
): msg is WSMessage & { data: BuildLogData } {
  return msg.type === "build-log";
}

export function isBuildComplete(
  msg: WSMessage,
): msg is WSMessage & { data: BuildCompleteData } {
  return msg.type === "build-complete";
}

export function isTestResult(
  msg: WSMessage,
): msg is WSMessage & { data: TestResultData } {
  return msg.type === "test-result";
}

export function isTestComplete(
  msg: WSMessage,
): msg is WSMessage & { data: TestCompleteData } {
  return msg.type === "test-complete";
}

export function isDeployStatus(
  msg: WSMessage,
): msg is WSMessage & { data: DeployStatusData } {
  return msg.type === "deploy-status";
}

// ─── Client ───────────────────────────────────────────────────────────────────

type WSListener = (msg: WSMessage) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<WSListener>();

/**
 * Connect to the SolFlow WebSocket server.
 * Safe to call multiple times — only one connection is maintained.
 */
export function connectWS(): void {
  if (typeof window === "undefined") return; // SSR guard
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/api/ws`;

  socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.addEventListener("message", (event: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(event.data) as WSMessage;
      listeners.forEach((fn) => fn(msg));
    } catch {
      // Ignore malformed messages
    }
  });

  socket.addEventListener("close", () => {
    socket = null;
    // Reconnect after 3 seconds
    reconnectTimer = setTimeout(() => connectWS(), 3_000);
  });

  socket.addEventListener("error", () => {
    socket?.close();
  });
}

/**
 * Disconnect from the WebSocket server (e.g., on page unload).
 */
export function disconnectWS(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}

/**
 * Subscribe to all incoming WebSocket messages.
 * Returns an unsubscribe function.
 */
export function onWSMessage(fn: WSListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Subscribe to WebSocket messages for a specific job ID.
 * Returns an unsubscribe function.
 */
export function onJobMessage(jobId: string, fn: WSListener): () => void {
  const wrapped: WSListener = (msg) => {
    if (msg.jobId === jobId) fn(msg);
  };
  listeners.add(wrapped);
  return () => listeners.delete(wrapped);
}

/**
 * Send a raw message to the server (e.g., to subscribe to a job's events).
 */
export function sendWS(payload: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}
