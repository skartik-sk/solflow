// ErrorBoundary — catches render errors in child subtrees and shows a graceful
// fallback instead of crashing the whole editor. Must be a class component
// because React's getDerivedStateFromError / componentDidCatch are class-only.

"use client";

import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// ─── External error reporting ────────────────────────────────────────────────
// Sends errors to a configured endpoint (Sentry, Axiom, etc.) when available.

async function reportError(error: Error, info: React.ErrorInfo): Promise<void> {
  const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT;
  if (!endpoint) return;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        timestamp: new Date().toISOString(),
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
      keepalive: true,
    });
  } catch {
    // Silently fail — error reporting should never break the app
  }
}

interface Props {
  children: React.ReactNode;
  /** Optional label shown in the fallback UI so users know which area crashed */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console with structured context
    console.error("[ErrorBoundary]", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      label: this.props.label,
      timestamp: new Date().toISOString(),
    });

    // Report to external error tracking if configured
    reportError(error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          label={this.props.label}
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

// ─── Fallback UI ─────────────────────────────────────────────────────────────

function ErrorFallback({
  label,
  error,
  onReset,
}: {
  label?: string;
  error: Error | null;
  onReset: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">
          {label ? `${label} crashed` : "Something went wrong"}
        </p>
        {error && (
          <p className="max-w-sm text-xs text-muted-foreground font-mono break-all">
            {error.message}
          </p>
        )}
      </div>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
      >
        <RotateCcw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
