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
const listeners = new Set();
/**
 * Connect to the SolFlow WebSocket server.
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
        // Reconnect after 3 seconds
        reconnectTimer = setTimeout(() => connectWS(), 3000);
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
