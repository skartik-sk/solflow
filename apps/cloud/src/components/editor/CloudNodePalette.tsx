"use client";

// CloudNodePalette — left sidebar with draggable cloud node types.

import React, { useMemo } from "react";
import { GripVertical, Search, X } from "lucide-react";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { cloudNodeRegistry, getIconByName, CATEGORY_COLORS, CATEGORY_LABELS, type CloudNodeDefinition, type NodeCategory } from "@solflow/cloud-nodes";
import { edChipBtn, edInput, edKbd, edPanelHeader, edPanelTitle, edx } from "./editor-chrome";

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
    <aside
      aria-label="Node palette"
      className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-card"
    >
      {/* Header */}
      <div className={edPanelHeader}>
        <p className={edPanelTitle}>Nodes</p>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground/60">
          {filtered.length}
        </span>
      </div>

      {/* Search */}
      <div className="px-2 pt-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={paletteSearch}
            onChange={(e) => setPaletteSearch(e.target.value)}
            placeholder="Search nodes..."
            aria-label="Search nodes"
            className={edx(edInput, "pl-6 pr-6")}
          />
          {paletteSearch && (
            <button
              onClick={() => setPaletteSearch("")}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Category pills */}
      {!paletteSearch && (
        <div className="flex flex-wrap gap-1 px-2 pb-1 pt-2">
          <button
            onClick={() => setPaletteCategory(null)}
            aria-pressed={!paletteCategory}
            className={pillCls(!paletteCategory)}
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setPaletteCategory(cat === paletteCategory ? null : cat)}
              aria-pressed={paletteCategory === cat}
              className={pillCls(paletteCategory === cat)}
            >
              {CATEGORY_LABELS[cat] ?? cat}
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
                ? `No nodes match "${paletteSearch}"`
                : "No nodes in this category"}
            </p>
            {paletteSearch.trim() && (
              <button
                onClick={() => setPaletteSearch("")}
                className={edChipBtn}
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {Array.from(grouped.entries()).map(([category, defs]) => (
          <div key={category}>
            {!paletteCategory && (
              <div className="sticky top-0 z-[1] flex items-center gap-2 bg-card px-3 pb-1 pt-2.5">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: CATEGORY_COLORS[category] }}
                />
                <p className="text-[11px] font-medium text-muted-foreground">
                  {CATEGORY_LABELS[category] ?? category}
                </p>
                <span className="ml-auto font-mono text-[10.5px] tabular-nums text-muted-foreground/50">
                  {defs.length}
                </span>
              </div>
            )}

            {defs.map((def) => (
              <div
                key={def.type}
                draggable
                onDragStart={(e) => onDragStart(e, def)}
                className="group mx-1.5 flex h-8 cursor-grab items-center gap-2 rounded-md px-1.5 transition-colors duration-150 ease-out hover:bg-white/[0.05] active:cursor-grabbing"
                title={def.description}
              >
                <span
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] [&_svg]:h-3 [&_svg]:w-3"
                  style={{ background: `${def.color}24`, color: def.color }}
                >
                  {getIconByName(def.icon)}
                </span>
                <p className="min-w-0 truncate text-[12.5px] text-foreground/85 group-hover:text-foreground">
                  {def.label}
                </p>
                <GripVertical
                  aria-hidden
                  size={12}
                  className="ml-auto shrink-0 text-muted-foreground/0 transition-colors duration-150 ease-out group-hover:text-muted-foreground/60"
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Shortcuts */}
      <div className="shrink-0 space-y-1 border-t border-border px-3 py-2">
        <HintRow keys="Ctrl+Z" label="Undo" />
        <HintRow keys="Del" label="Delete" />
        <HintRow keys="Space+Drag" label="Pan" />
      </div>
    </aside>
  );
}

function pillCls(active: boolean) {
  return `h-[22px] rounded-md px-2 text-[11.5px] font-medium outline-none transition-[color,background-color,box-shadow] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
    active
      ? "bg-[#23262c] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.08)]"
      : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
  }`;
}

function HintRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground/70">{label}</span>
      <kbd className={edKbd}>{keys}</kbd>
    </div>
  );
}
