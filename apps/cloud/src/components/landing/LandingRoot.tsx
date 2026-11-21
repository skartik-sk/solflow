import type { ReactNode } from "react";
import "./landing.css";

/** The landing tokens (landing.css, copied from apps/web) scoped under `.sl`. Geist comes from the root layout. */
export function LandingRoot({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`sl ${className}`}>{children}</div>;
}
