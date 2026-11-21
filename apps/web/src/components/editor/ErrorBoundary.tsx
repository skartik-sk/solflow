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

    // Auto-recover from chunk load errors after a brief delay
    if (error.message?.includes("Loading chunk") || error.name === "ChunkLoadError") {
      setTimeout(() => this.handleReset(), 1500);
    }
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-red-500/20 bg-red-500/10">
        <AlertTriangle className="h-4 w-4 text-red-400" />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-foreground">
          {label ? `${label} crashed` : "Something went wrong"}
        </p>
        {error && (
          <p className="max-w-sm text-[12px] text-muted-foreground font-mono break-all">
            {error.message}
          </p>
        )}
      </div>
      <button
        onClick={onReset}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.03] px-3 text-[12px] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(255,255,255,0.08)] transition-[background-color,transform] duration-150 ease-out hover:bg-white/[0.07] active:scale-[0.97]"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}
