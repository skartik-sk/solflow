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
import { edKbd, edPanelHeader, edPanelTitle } from "@/components/ui-kit/editor-ui";

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
    <div className="flex h-full w-[216px] shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className={edPanelHeader}>
        <p className={edPanelTitle}>Nodes</p>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          {filtered.length}
        </span>
      </div>

      {/* Search */}
      <div className="px-2 pt-2 pb-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={paletteSearch}
            onChange={(e) => setPaletteSearch(e.target.value)}
            placeholder="Search nodes…"
            aria-label="Search nodes"
            className="h-7 w-full rounded-md border border-white/[0.08] bg-background/60 pl-7 pr-6 text-[12px] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground/60 hover:border-white/[0.14] focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
          />
          {paletteSearch && (
            <button
              onClick={() => setPaletteSearch("")}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Category filter pills */}
      {!paletteSearch && (
        <div className="flex flex-wrap gap-1 border-b border-border px-2 pb-2">
          <button
            onClick={() => setPaletteCategory(null)}
            className={`h-[22px] rounded-[5px] px-1.5 text-[11px] font-medium outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
              !paletteCategory
                ? "bg-primary/15 text-primary shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
                : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
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
              className={`h-[22px] rounded-[5px] px-1.5 text-[11px] font-medium outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                paletteCategory === cat
                  ? "bg-primary/15 text-primary shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
                  : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
              }`}
            >
              {cat.length > 14 ? cat.split("&")[0].trim() : cat}
            </button>
          ))}
        </div>
      )}

      {/* Node list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-3 pt-8 text-center">
            <p className="text-[12px] text-muted-foreground">
              {paletteSearch.trim()
                ? <>No nodes match &ldquo;{paletteSearch}&rdquo;</>
                : "No nodes in this category"}
            </p>
            {paletteSearch.trim() && (
              <button
                onClick={() => setPaletteSearch("")}
                className="rounded text-[12px] text-primary outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
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
              <div className="sticky top-0 z-[1] bg-card px-3 pb-1 pt-2.5">
                <p className="text-[11px] font-medium text-muted-foreground/80">
                  {category}
                </p>
              </div>
            )}

            {defs.map((def) => (
              <div
                key={def.type}
                draggable
                onDragStart={(e) => onDragStart(e, def.type)}
                className="group mx-1.5 flex h-8 cursor-grab items-center gap-2 rounded-md px-1.5 transition-[background-color,transform] duration-150 ease-out hover:bg-white/[0.05] active:scale-[0.98] active:cursor-grabbing"
                title={def.description}
              >
                <span
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px]"
                  style={{
                    background: `${def.color}24`,
                    boxShadow: `inset 0 0 0 1px ${def.color}33`,
                    color: def.color,
                  }}
                >
                  {def.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-foreground/90 group-hover:text-foreground">{def.label}</p>
                </div>
                <span aria-hidden className="grid grid-cols-2 gap-[2px] opacity-0 transition-opacity duration-150 group-hover:opacity-40">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <i key={i} className="h-[2px] w-[2px] rounded-full bg-foreground" />
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="shrink-0 space-y-1.5 border-t border-border px-3 py-2.5">
        <p className="text-[11px] font-medium text-muted-foreground/80">
          Shortcuts
        </p>
        <div className="space-y-1">
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
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <kbd className={edKbd}>
        {keys}
      </kbd>
    </div>
  );
}
