"use client";

// CloudNodePalette — left sidebar with draggable cloud node types.

import React, { useMemo } from "react";
import { Search, X } from "lucide-react";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { cloudNodeRegistry, getIconByName, CATEGORY_LABELS, type CloudNodeDefinition, type NodeCategory } from "@solflow/cloud-nodes";

export function CloudNodePalette() {
  const { paletteSearch, paletteCategory, setPaletteSearch, setPaletteCategory } =
    useEditorUIStore();

  // Get all registered nodes
  const allDefs = useMemo(() => cloudNodeRegistry.getAll(), []);

  const allCategories = useMemo(
    () => Array.from(new Set(allDefs.map((n) => n.category))) as NodeCategory[],
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

  const grouped = useMemo(() => {
    const map = new Map<NodeCategory, CloudNodeDefinition[]>();
    for (const def of filtered) {
      const arr = map.get(def.category) ?? [];
      arr.push(def);
      map.set(def.category, arr);
    }
    return map;
  }, [filtered]);

  const onDragStart = (e: React.DragEvent, def: CloudNodeDefinition) => {
    e.dataTransfer.setData(
      "application/solflow-cloud-node",
      JSON.stringify({
        type: def.type,
        label: def.label,
        category: def.category,
        icon: def.icon,
        color: def.color,
        properties: def.properties,
        inputs: def.inputs,
        outputs: def.outputs,
        defaultData: def.defaultData,
      }),
    );
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
            placeholder="Search nodes..."
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

      {/* Category pills */}
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
              onClick={() => setPaletteCategory(cat === paletteCategory ? null : cat)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                paletteCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
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
                ? `No nodes match "${paletteSearch}"`
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
            {!paletteCategory && (
              <div className="sticky top-0 bg-card px-3 pb-1 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {CATEGORY_LABELS[category] ?? category}
                </p>
              </div>
            )}

            {defs.map((def) => (
              <div
                key={def.type}
                draggable
                onDragStart={(e) => onDragStart(e, def)}
                className="mx-2 mb-1 flex cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-accent active:cursor-grabbing"
                title={def.description}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{ background: `${def.color}22`, color: def.color }}
                >
                  {getIconByName(def.icon)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{def.label}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Shortcuts */}
      <div className="shrink-0 border-t border-border px-3 py-2 space-y-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/40">
          Shortcuts
        </p>
        <div className="space-y-0.5">
          <HintRow keys="Ctrl+Z" label="Undo" />
          <HintRow keys="Del" label="Delete" />
          <HintRow keys="Space+Drag" label="Pan" />
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
