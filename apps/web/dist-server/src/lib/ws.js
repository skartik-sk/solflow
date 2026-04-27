"use strict";
// apps/web/src/lib/ws.ts
// WebSocket client helper for streaming compile/test/deploy progress.
// Per docs/architecture/09-compilation-deployment.md → WebSocket Communication.
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBuildLog = isBuildLog;
exports.isBuildComplete = isBuildComplete;
exports.isTestResult = isTestResult;
exports.isTestComplete = isTestComplete;
exports.isDeployStatus = isDeployStatus;
exports.connectWS = connectWS;
exports.disconnectWS = disconnectWS;
exports.onWSMessage = onWSMessage;
exports.onJobMessage = onJobMessage;
exports.sendWS = sendWS;
exports.subscribeToJob = subscribeToJob;
// ─── Type guards ──────────────────────────────────────────────────────────────
function isBuildLog(msg) {
    return msg.type === "build-log";
}
function isBuildComplete(msg) {
    return msg.type === "build-complete";
}
function isTestResult(msg) {
    return msg.type === "test-result";
}
function isTestComplete(msg) {
    return msg.type === "test-complete";
}
function isDeployStatus(msg) {
    return msg.type === "deploy-status";
}
let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;
const listeners = new Set();
function getReconnectDelay() {
    // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
    const delay = Math.min(BASE_RECONNECT_MS * Math.pow(2, reconnectAttempts), MAX_RECONNECT_MS);
    // Add random jitter (0-25% of delay) to avoid thundering herd
    const jitter = delay * Math.random() * 0.25;
    return delay + jitter;
}
/**
 * Connect to the SolStudio WebSocket server.
 * Safe to call multiple times — only one connection is maintained.
 */
function connectWS() {
    if (typeof window === "undefined")
        return; // SSR guard
    if (socket &&
        (socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING)) {
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
        reconnectAttempts = 0; // Reset on successful connection
    });
    socket.addEventListener("message", (event) => {
        try {
            const msg = JSON.parse(event.data);
            listeners.forEach((fn) => fn(msg));
        }
        catch {
            // Ignore malformed messages
        }
    });
    socket.addEventListener("close", () => {
        socket = null;
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = getReconnectDelay();
            reconnectAttempts++;
            reconnectTimer = setTimeout(() => connectWS(), delay);
        }
    });
    socket.addEventListener("error", () => {
        socket?.close();
    });
}
/**
 * Disconnect from the WebSocket server (e.g., on page unload).
 */
function disconnectWS() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    reconnectAttempts = 0;
    socket?.close();
    socket = null;
}
/**
 * Subscribe to all incoming WebSocket messages.
 * Returns an unsubscribe function.
 */
function onWSMessage(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
/**
 * Subscribe to WebSocket messages for a specific job ID.
 * Returns an unsubscribe function.
 */
function onJobMessage(jobId, fn) {
    const wrapped = (msg) => {
        if (msg.jobId === jobId)
            fn(msg);
    };
    listeners.add(wrapped);
    return () => listeners.delete(wrapped);
}
/**
 * Send a raw message to the server (e.g., to subscribe to a job's events).
 */
function sendWS(payload) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    }
}
/**
 * Subscribe the server to events for a specific job.
 * If the socket is still connecting, queues the subscribe message until open.
 */
function subscribeToJob(jobId) {
    const msg = { type: "subscribe", jobId };
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
    }
    else if (socket?.readyState === WebSocket.CONNECTING) {
        socket.addEventListener("open", () => {
            socket?.send(JSON.stringify(msg));
        }, { once: true });
    }
}
