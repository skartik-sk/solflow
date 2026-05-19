// Node Palette — left sidebar panel listing all draggable node types.
// Organised into categories, searchable. Plugin nodes are merged in when enabled.

"use client";

import React, { useMemo } from "react";
import {
  Code2,
  Zap,
  Wallet,
  Database,
  Shield,
  AlertTriangle,
  Radio,
  GitBranch,
  Terminal,
  Search,
  X,
  Puzzle,
} from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { usePluginStore } from "@/store/plugin-store";
import { pluginRegistry } from "@solflow/plugin-sdk";
import { registerBuiltInPlugins } from "@/lib/plugins/built-ins";

registerBuiltInPlugins();

interface NodeDef {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  category: string;
}

const NODE_DEFS: NodeDef[] = [
  // Program Structure
  {
    type: "program",
    label: "Program Root",
    description: "Top-level program container",
    icon: <Code2 size={13} />,
    color: "#4a47a3",
    category: "Program Structure",
  },
  {
    type: "instruction",
    label: "Instruction",
    description: "Instruction handler / entry point",
    icon: <Zap size={13} />,
    color: "#2563eb",
    category: "Program Structure",
  },
  {
    type: "error",
    label: "Error Definition",
    description: "Custom program error type",
    icon: <AlertTriangle size={13} />,
    color: "#dc2626",
    category: "Program Structure",
  },
  // Accounts & State
  {
    type: "account",
    label: "Account",
    description: "Account passed to an instruction",
    icon: <Wallet size={13} />,
    color: "#16a34a",
    category: "Accounts & State",
  },
  {
    type: "state",
    label: "State Definition",
    description: "On-chain data struct",
    icon: <Database size={13} />,
    color: "#7c3aed",
    category: "Accounts & State",
  },
  // Constraints
  {
    type: "constraint",
    label: "Constraint",
    description: "Account constraint / validation",
    icon: <Shield size={13} />,
    color: "#ea580c",
    category: "Constraints",
  },
  // Events
  {
    type: "event",
    label: "Event",
    description: "Program event definition",
    icon: <Radio size={13} />,
    color: "#eab308",
    category: "Events",
  },
  // Logic
  {
    type: "logic",
    label: "Logic Block",
    description: "Instruction body operation",
    icon: <GitBranch size={13} />,
    color: "#0d9488",
    category: "Logic & Control",
  },
  // Custom Code
  {
    type: "custom-code",
    label: "Rust Code Block",
    description: "Inject arbitrary Rust logic",
    icon: <Terminal size={13} />,
    color: "#374151",
    category: "Custom Code",
  },
];

export function NodePalette() {
  const {
    paletteSearch,
    paletteCategory,
    setPaletteSearch,
    setPaletteCategory,
  } = useUIStore();
  const { enabledPluginIds } = usePluginStore();

  // Merge built-in nodes + nodes from enabled plugins
  const allDefs = useMemo<NodeDef[]>(() => {
    const pluginDefs: NodeDef[] = [];
    for (const pluginId of enabledPluginIds) {
      const plugin = pluginRegistry.getPlugin(pluginId);
      if (!plugin) continue;
      for (const node of plugin.nodes) {
        pluginDefs.push({
          type: node.type.includes(":")
            ? node.type
            : `${pluginId}:${node.type}`,
          label: node.label,
          description: node.description,
          icon: <Puzzle size={13} />,
          color: "#7c3aed",
          category: node.category,
        });
      }
    }
    return [...NODE_DEFS, ...pluginDefs];
  }, [enabledPluginIds]);

  // All categories including plugin categories
  const allCategories = useMemo(
    () => Array.from(new Set(allDefs.map((n) => n.category))),
    [allDefs],
  );

  const filtered = useMemo(() => {
    let defs = allDefs;
    if (paletteSearch.trim()) {
      const q = paletteSearch.toLowerCase();
      defs = defs.filter(
        (d) =>
          d.label.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.type.includes(q),
      );
    }
    if (paletteCategory) {
      defs = defs.filter((d) => d.category === paletteCategory);
    }
    return defs;
  }, [allDefs, paletteSearch, paletteCategory]);

  // Group by category for display
  const grouped = useMemo(() => {
    const map = new Map<string, NodeDef[]>();
    for (const def of filtered) {
      const arr = map.get(def.category) ?? [];
      arr.push(def);
      map.set(def.category, arr);
    }
    return map;
  }, [filtered]);

  const onDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData("application/solflow-node", type);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex h-full w-[200px] flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Nodes
        </p>
      </div>

      {/* Search */}
      <div className="px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={paletteSearch}
            onChange={(e) => setPaletteSearch(e.target.value)}
            placeholder="Search nodes…"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-6 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {paletteSearch && (
            <button
              onClick={() => setPaletteSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Category filter pills */}
      {!paletteSearch && (
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          <button
            onClick={() => setPaletteCategory(null)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              !paletteCategory
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() =>
                setPaletteCategory(cat === paletteCategory ? null : cat)
              }
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                paletteCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat.length > 14 ? cat.split("&")[0].trim() : cat}
            </button>
          ))}
        </div>
      )}

      {/* Node list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-3 pt-8 text-center">
            <p className="text-xs text-muted-foreground">
              {paletteSearch.trim()
                ? <>No nodes match &ldquo;{paletteSearch}&rdquo;</>
                : "No nodes in this category"}
            </p>
            {paletteSearch.trim() && (
              <button
                onClick={() => setPaletteSearch("")}
                className="text-[10px] text-primary hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {Array.from(grouped.entries()).map(([category, defs]) => (
          <div key={category}>
            {/* Category header — only show when not filtered to one cat */}
            {!paletteCategory && (
              <div className="sticky top-0 bg-card px-3 pb-1 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {category}
                </p>
              </div>
            )}

            {defs.map((def) => (
              <div
                key={def.type}
                draggable
                onDragStart={(e) => onDragStart(e, def.type)}
                className="mx-2 mb-1 flex cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-accent active:cursor-grabbing"
                title={def.description}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{
                    background: `${def.color}22`,
                    color: def.color,
                  }}
                >
                  {def.icon}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{def.label}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="shrink-0 border-t border-border px-3 py-2 space-y-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/40">
          Shortcuts
        </p>
        <div className="space-y-0.5">
          <HintRow keys="Ctrl+F" label="Find node" />
          <HintRow keys="Ctrl+C/V" label="Copy/paste" />
          <HintRow keys="Ctrl+S" label="Save" />
          <HintRow keys="Del" label="Delete" />
        </div>
      </div>
    </div>
  );
}

function HintRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-muted-foreground/40">{label}</span>
      <kbd className="rounded border border-border/40 bg-muted/50 px-1 py-0 font-mono text-[9px] text-muted-foreground/50">
        {keys}
      </kbd>
    </div>
  );
}
