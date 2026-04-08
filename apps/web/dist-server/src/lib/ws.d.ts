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
    phase: "preparing" | "signing" | "submitting" | "confirming" | "complete" | "error";
    txSig?: string;
    txSignature?: string;
    programId?: string;
    explorerUrl?: string;
    txExplorerUrl?: string;
    error?: string;
    log?: string;
    level?: "info" | "warn" | "error";
}
export type WSMessageData = BuildLogData | BuildCompleteData | TestResultData | TestCompleteData | DeployStatusData;
export interface WSMessage {
    type: "build-log" | "build-complete" | "test-result" | "test-complete" | "deploy-status";
    jobId: string;
    data: WSMessageData;
}
export declare function isBuildLog(msg: WSMessage): msg is WSMessage & {
    data: BuildLogData;
};
export declare function isBuildComplete(msg: WSMessage): msg is WSMessage & {
    data: BuildCompleteData;
};
export declare function isTestResult(msg: WSMessage): msg is WSMessage & {
    data: TestResultData;
};
export declare function isTestComplete(msg: WSMessage): msg is WSMessage & {
    data: TestCompleteData;
};
export declare function isDeployStatus(msg: WSMessage): msg is WSMessage & {
    data: DeployStatusData;
};
type WSListener = (msg: WSMessage) => void;
/**
 * Connect to the SolFlow WebSocket server.
 * Safe to call multiple times — only one connection is maintained.
 */
export declare function connectWS(): void;
/**
 * Disconnect from the WebSocket server (e.g., on page unload).
 */
export declare function disconnectWS(): void;
/**
 * Subscribe to all incoming WebSocket messages.
 * Returns an unsubscribe function.
 */
export declare function onWSMessage(fn: WSListener): () => void;
/**
 * Subscribe to WebSocket messages for a specific job ID.
 * Returns an unsubscribe function.
 */
export declare function onJobMessage(jobId: string, fn: WSListener): () => void;
/**
 * Send a raw message to the server (e.g., to subscribe to a job's events).
 */
export declare function sendWS(payload: unknown): void;
export {};
//# sourceMappingURL=ws.d.ts.map