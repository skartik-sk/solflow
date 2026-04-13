// Shared Row component used by all node body renderers.
// Extracted to avoid duplication across 8+ node files.

import React from "react";

export function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground/70">{label}</span>
      <span
        className={`truncate max-w-[120px] text-right ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
