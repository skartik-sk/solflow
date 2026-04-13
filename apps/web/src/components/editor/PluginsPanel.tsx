// PluginsPanel — shows all registered plugins and lets the user enable/disable them.
// Includes validation warnings and security indicators.
"use client";

import React, { useMemo } from "react";
import { Puzzle, ExternalLink, CheckCircle2, Circle, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import { pluginRegistry } from "@solflow/plugin-sdk";
import { usePluginStore } from "@/store/plugin-store";
import type { SolFlowPlugin } from "@solflow/plugin-sdk";

// ─── Plugin validation ──────────────────────────────────────────────────────

interface ValidationWarning {
  severity: "warn" | "error";
  message: string;
}

function validatePlugin(plugin: SolFlowPlugin): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Required metadata checks
  if (!plugin.id || plugin.id.trim() === "") {
    warnings.push({ severity: "error", message: "Plugin has no ID" });
  }
  if (!plugin.version || !/^\d+\.\d+\.\d+/.test(plugin.version)) {
    warnings.push({ severity: "warn", message: "Version is missing or invalid semver" });
  }
  if (!plugin.name || plugin.name.trim() === "") {
    warnings.push({ severity: "error", message: "Plugin has no name" });
  }
  if (!plugin.author || plugin.author.trim() === "") {
    warnings.push({ severity: "warn", message: "No author specified" });
  }
  if (!plugin.description || plugin.description.trim() === "") {
    warnings.push({ severity: "warn", message: "No description" });
  }

  // Node validation
  for (const node of plugin.nodes) {
    if (!node.type || node.type.trim() === "") {
      warnings.push({ severity: "error", message: `Node missing type ID` });
    }
    if (!node.label || node.label.trim() === "") {
      warnings.push({ severity: "warn", message: `Node "${node.type}" missing label` });
    }
    if (!node.toIR || typeof node.toIR !== "function") {
      warnings.push({ severity: "error", message: `Node "${node.type}" missing toIR function` });
    }
    // Check for dangerously broad component references
    if (!node.component) {
      warnings.push({ severity: "warn", message: `Node "${node.type}" has no render component` });
    }
  }

  // Codegen validation
  if (!plugin.codegen || (!plugin.codegen.anchor && !plugin.codegen.pinocchio)) {
    warnings.push({ severity: "warn", message: "No codegen hooks defined" });
  }

  // Security: check for audit rules
  if (!plugin.auditRules || plugin.auditRules.length === 0) {
    warnings.push({ severity: "warn", message: "No audit rules — code not security-reviewed" });
  }

  return warnings;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PluginsPanel() {
  const { enabledPluginIds, togglePlugin } = usePluginStore();
  const allPlugins = pluginRegistry.getAllPlugins();

  // Validate all plugins once
  const validationMap = useMemo(() => {
    const map = new Map<string, ValidationWarning[]>();
    for (const plugin of allPlugins) {
      map.set(plugin.id, validatePlugin(plugin));
    }
    return map;
  }, [allPlugins]);

  if (allPlugins.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Puzzle className="h-8 w-8 opacity-30" />
        <p className="text-sm font-medium">No plugins registered</p>
        <p className="text-xs max-w-64 text-center">
          First-party plugins (SPL Token, Metaplex, Pyth) are registered at app
          startup.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Plugins ({allPlugins.length})
        </span>
        <span className="text-xs text-muted-foreground">
          {enabledPluginIds.length} enabled
        </span>
      </div>

      {/* Plugin list */}
      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
        {allPlugins.map((plugin) => {
          const enabled = enabledPluginIds.includes(plugin.id);
          const warnings = validationMap.get(plugin.id) ?? [];
          const hasErrors = warnings.some((w) => w.severity === "error");
          const hasAuditRules = (plugin.auditRules?.length ?? 0) > 0;
          const isKnownAuthor = ["SolFlow", "SolFlow Team", "Community"].includes(plugin.author);

          return (
            <div
              key={plugin.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
            >
              {/* Toggle */}
              <button
                onClick={() => togglePlugin(plugin.id)}
                className={`mt-0.5 shrink-0 transition-colors ${
                  enabled
                    ? "text-primary hover:text-primary/80"
                    : "text-muted-foreground/40 hover:text-muted-foreground"
                }`}
                title={enabled ? "Disable plugin" : "Enable plugin"}
              >
                {enabled ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </button>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{plugin.name}</span>
                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                    v{plugin.version}
                  </span>
                  {enabled && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      active
                    </span>
                  )}
                  {/* Security badge */}
                  {hasAuditRules ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-400" title="Has audit rules">
                      <ShieldCheck size={10} />
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px] text-yellow-400" title="No audit rules — unreviewed codegen">
                      <ShieldAlert size={10} />
                    </span>
                  )}
                  {!isKnownAuthor && (
                    <span className="flex items-center gap-0.5 text-[10px] text-orange-400" title="Unverified author">
                      <AlertTriangle size={10} />
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {plugin.description}
                </p>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground/60">
                  <span>by {plugin.author}</span>
                  <span>
                    {plugin.nodes.length} node
                    {plugin.nodes.length !== 1 ? "s" : ""}
                  </span>
                  {plugin.website ? (
                    <a
                      href={plugin.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-0.5 hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      docs
                    </a>
                  ) : (
                    <span className="text-orange-400/60">no docs link</span>
                  )}
                </div>

                {/* Validation warnings */}
                {warnings.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {warnings.map((w, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-1 text-[10px] ${
                          w.severity === "error"
                            ? "text-red-400"
                            : "text-yellow-400/80"
                        }`}
                      >
                        <AlertTriangle size={9} className="mt-0.5 shrink-0" />
                        <span>{w.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Node list preview */}
                {enabled && plugin.nodes.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {plugin.nodes.slice(0, 4).map((node) => (
                      <span
                        key={node.type}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {node.label}
                      </span>
                    ))}
                    {plugin.nodes.length > 4 && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        +{plugin.nodes.length - 4} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
