"use client";

// apps/web/src/components/providers/MonitoringProvider.tsx
// Initializes Sentry client-side monitoring on mount.
// Per docs/architecture/20-roadmap.md — Monitoring and logging

import { useEffect } from "react";
import { initSentry } from "@/lib/monitoring";

export function MonitoringProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    initSentry();
  }, []);

  return <>{children}</>;
}
