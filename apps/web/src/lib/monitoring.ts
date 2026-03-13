// apps/web/src/lib/monitoring.ts
// Sentry + Axiom monitoring integration
// Per docs/architecture/20-roadmap.md — Monitoring and logging
//
// @sentry/nextjs is an OPTIONAL peer dependency.
// This module gracefully no-ops when the package is not installed
// or when NEXT_PUBLIC_SENTRY_DSN / AXIOM_TOKEN are not set.

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MonitoringEvent {
  name: string;
  properties?: Record<string, unknown>;
  userId?: string;
}

export interface MonitoringError {
  error: Error | unknown;
  context?: Record<string, unknown>;
  userId?: string;
}

// ─── Sentry loader helper ─────────────────────────────────────────────────────

/** Dynamically load @sentry/nextjs without requiring it as a static dep. */
async function loadSentry(): Promise<any | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional package
    return await import("@sentry/nextjs");
  } catch {
    return null;
  }
}

// ─── Sentry ──────────────────────────────────────────────────────────────────

/**
 * Initialize Sentry error tracking.
 * Only initializes when NEXT_PUBLIC_SENTRY_DSN is set.
 * Safe to call in both server and client environments.
 */
export function initSentry(): void {
  if (typeof window === "undefined") return; // server — handled by sentry.server.config.ts
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  void loadSentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      replaysSessionSampleRate: 0.2,
      replaysOnErrorSampleRate: 1.0,
      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "Non-Error promise rejection captured",
      ],
    });
  });
}

/**
 * Capture an exception and send to Sentry.
 * No-ops when Sentry is not configured or not installed.
 */
export async function captureException(opts: MonitoringError): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const Sentry = await loadSentry();
  if (!Sentry) {
    console.error(
      "[monitoring] captureException (Sentry not installed):",
      opts.error,
    );
    return;
  }

  Sentry.withScope((scope: any) => {
    if (opts.userId) scope.setUser({ id: opts.userId });
    if (opts.context) scope.setExtras(opts.context);
    Sentry.captureException(opts.error);
  });
}

/**
 * Capture a message and send to Sentry.
 * No-ops when Sentry is not configured or not installed.
 */
export async function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const Sentry = await loadSentry();
  if (!Sentry) return;
  Sentry.captureMessage(message, level);
}

// ─── Axiom ───────────────────────────────────────────────────────────────────

/**
 * Send a structured event to Axiom for observability logging.
 * Only sends when AXIOM_DATASET and AXIOM_TOKEN are set.
 * Safe to call from server-side code (API routes, server components).
 */
export async function logEvent(event: MonitoringEvent): Promise<void> {
  if (!process.env.AXIOM_DATASET || !process.env.AXIOM_TOKEN) return;

  const payload = [
    {
      ...event.properties,
      _time: new Date().toISOString(),
      event: event.name,
      userId: event.userId ?? "anonymous",
      env: process.env.NODE_ENV,
    },
  ];

  try {
    await fetch(
      `https://api.axiom.co/v1/datasets/${process.env.AXIOM_DATASET}/ingest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
  } catch (err) {
    // Axiom ingest must never throw — swallow silently
    if (process.env.NODE_ENV === "development") {
      console.warn("[monitoring] Axiom ingest failed:", err);
    }
  }
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Log a code generation event for analytics. */
export async function logCodeGenEvent(opts: {
  userId?: string;
  framework: "anchor" | "pinocchio";
  instructionCount: number;
  durationMs: number;
  hasErrors: boolean;
}): Promise<void> {
  await logEvent({
    name: "code_gen",
    userId: opts.userId,
    properties: {
      framework: opts.framework,
      instruction_count: opts.instructionCount,
      duration_ms: opts.durationMs,
      has_errors: opts.hasErrors,
    },
  });
}

/** Log a project save event. */
export async function logProjectSave(opts: {
  userId?: string;
  projectId: string;
  nodeCount: number;
  edgeCount: number;
}): Promise<void> {
  await logEvent({
    name: "project_save",
    userId: opts.userId,
    properties: {
      project_id: opts.projectId,
      node_count: opts.nodeCount,
      edge_count: opts.edgeCount,
    },
  });
}

/** Log a compilation job dispatch. */
export async function logCompilationDispatched(opts: {
  userId?: string;
  projectId: string;
  framework: "anchor" | "pinocchio";
}): Promise<void> {
  await logEvent({
    name: "compilation_dispatched",
    userId: opts.userId,
    properties: {
      project_id: opts.projectId,
      framework: opts.framework,
    },
  });
}
