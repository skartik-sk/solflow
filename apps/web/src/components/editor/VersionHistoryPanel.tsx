// VersionHistoryPanel — version control timeline for the editor.
// Shows list of snapshots, diff summary per version, restore controls,
// diff overlay activation, and inline snapshot label editing.

"use client";

import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useProjectStore } from "@/store/project-store";
import { useFlowStore } from "@/store/flow-store";
import { useUIStore } from "@/store/ui-store";
import { toast } from "sonner";
import type { FlowDiff } from "@solflow/versioning";
import type { Node, Edge } from "@xyflow/react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SnapshotListItem {
  id: string;
  version: number;
  label: string | null;
  flowHash: string;
  diffData: unknown;
  createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function DiffBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] ${color}`}>
      <span className="font-semibold">{count}</span> {label}
    </span>
  );
}

function DiffSummary({ diff }: { diff: FlowDiff }) {
  const { stats } = diff;
  if (stats.totalChanges === 0) {
    return (
      <span className="text-[10px] text-muted-foreground">no changes</span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DiffBadge
        label="added"
        count={stats.addedNodes}
        color="text-green-400"
      />
      <DiffBadge
        label="removed"
        count={stats.removedNodes}
        color="text-red-400"
      />
      <DiffBadge
        label="modified"
        count={stats.modifiedNodes}
        color="text-yellow-400"
      />
      <DiffBadge label="moved" count={stats.movedNodes} color="text-blue-400" />
      <DiffBadge
        label="edges+"
        count={stats.addedEdges}
        color="text-green-400/70"
      />
      <DiffBadge
        label="edges-"
        count={stats.removedEdges}
        color="text-red-400/70"
      />
    </div>
  );
}

// ─── Inline label editor ───────────────────────────────────────────────────────

interface LabelEditorProps {
  snapshotId: string;
  initialLabel: string;
  onSaved: (newLabel: string) => void;
  onCancel: () => void;
}

function LabelEditor({
  snapshotId,
  initialLabel,
  onSaved,
  onCancel,
}: LabelEditorProps) {
  const [value, setValue] = useState(initialLabel);
  const updateLabel = trpc.snapshot.updateLabel.useMutation({
    onSuccess: () => onSaved(value),
    onError: () => toast.error("Failed to update label"),
  });

  const handleCommit = () => {
    const trimmed = value.trim();
    if (!trimmed) return onCancel();
    updateLabel.mutate({ snapshotId, label: trimmed });
  };

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleCommit();
        if (e.key === "Escape") onCancel();
      }}
      className="w-full rounded border border-primary/40 bg-background px-1 py-0.5 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface VersionHistoryPanelProps {
  projectId: string;
}

export function VersionHistoryPanel({ projectId }: VersionHistoryPanelProps) {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  // Local optimistic labels: snapshotId → label
  const [localLabels, setLocalLabels] = useState<Record<string, string>>({});

  const { diffOverlay, setDiffOverlay } = useUIStore();
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);

  const {
    data: snapshots,
    isLoading,
    refetch,
  } = trpc.snapshot.list.useQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const restoreMutation = trpc.snapshot.restore.useMutation({
    onSuccess: (data) => {
      if (data.flowData && typeof data.flowData === "object") {
        const fd = data.flowData as { nodes?: Node[]; edges?: Edge[] };
        useFlowStore.getState().setFlow(fd.nodes ?? [], fd.edges ?? []);
        useProjectStore.getState().markDirty();
      }
      toast.success("Version restored");
      void refetch();
    },
    onError: () => toast.error("Restore failed"),
    onSettled: () => setRestoringId(null),
  });

  const handleRestore = (snapshotId: string) => {
    setRestoringId(snapshotId);
    restoreMutation.mutate({ snapshotId });
  };

  // Clear overlay when panel unmounts
  useEffect(() => {
    return () => {
      setDiffOverlay(null);
    };
  }, [setDiffOverlay]);

  const handleToggleOverlay = (snap: SnapshotListItem) => {
    const diff =
      snap.diffData && typeof snap.diffData === "object"
        ? (snap.diffData as unknown as FlowDiff)
        : null;
    if (!diff) return;

    if (activeOverlayId === snap.id) {
      // Toggle off
      setDiffOverlay(null);
      setActiveOverlayId(null);
    } else {
      setDiffOverlay(diff);
      setActiveOverlayId(snap.id);
    }
  };

  const handleClearOverlay = () => {
    setDiffOverlay(null);
    setActiveOverlayId(null);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading history…
      </div>
    );
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <p>No versions yet.</p>
        <p className="text-xs">Save manually (Ctrl+S) to create a version.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs font-semibold text-foreground">
          {snapshots.length} version{snapshots.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          {diffOverlay && (
            <button
              onClick={handleClearOverlay}
              className="rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400 hover:bg-yellow-500/20"
              title="Clear diff overlay from canvas"
            >
              Clear Overlay
            </button>
          )}
          <span className="text-[10px] text-muted-foreground">
            Ctrl+S creates a version
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="divide-y divide-border">
          {(snapshots as SnapshotListItem[]).map((snap, idx) => {
            const diff =
              snap.diffData && typeof snap.diffData === "object"
                ? (snap.diffData as unknown as FlowDiff)
                : null;
            const isFirst = idx === 0;
            const isRestoring = restoringId === snap.id;
            const isOverlayActive = activeOverlayId === snap.id;
            const hasDiff = !!diff && diff.stats.totalChanges > 0;
            const displayLabel =
              localLabels[snap.id] ??
              snap.label ??
              (isFirst ? "Current version" : `Version ${snap.version}`);

            return (
              <div
                key={snap.id}
                className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/30 ${
                  isFirst ? "bg-primary/5" : ""
                } ${isOverlayActive ? "ring-1 ring-inset ring-yellow-500/40" : ""}`}
              >
                {/* Version badge */}
                <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      isFirst
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    v{snap.version}
                  </div>
                  {idx < snapshots.length - 1 && (
                    <div className="h-3 w-px bg-border" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {editingLabelId === snap.id ? (
                      <LabelEditor
                        snapshotId={snap.id}
                        initialLabel={snap.label ?? ""}
                        onSaved={(newLabel) => {
                          setLocalLabels((prev) => ({
                            ...prev,
                            [snap.id]: newLabel,
                          }));
                          setEditingLabelId(null);
                        }}
                        onCancel={() => setEditingLabelId(null)}
                      />
                    ) : (
                      <button
                        className="min-w-0 truncate text-left text-xs font-medium text-foreground hover:text-primary"
                        title="Click to edit label"
                        onClick={() => setEditingLabelId(snap.id)}
                      >
                        {displayLabel}
                      </button>
                    )}
                    {isFirst && (
                      <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1 py-0.5 text-[9px] font-semibold text-primary">
                        CURRENT
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatRelativeTime(snap.createdAt)}
                  </p>

                  {/* Diff summary */}
                  {diff && (
                    <div className="mt-1">
                      <DiffSummary diff={diff} />
                    </div>
                  )}
                  {!diff && !isFirst && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                      initial version
                    </p>
                  )}

                  {/* Overlay button — only for snapshots with meaningful diff */}
                  {hasDiff && (
                    <button
                      onClick={() => handleToggleOverlay(snap)}
                      className={`mt-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        isOverlayActive
                          ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                      title={
                        isOverlayActive
                          ? "Hide diff on canvas"
                          : "Show diff on canvas"
                      }
                    >
                      {isOverlayActive ? "Hide on canvas" : "Show on canvas"}
                    </button>
                  )}
                </div>

                {/* Restore button (hidden on current version) */}
                {!isFirst && (
                  <button
                    onClick={() => handleRestore(snap.id)}
                    disabled={isRestoring || !!restoringId}
                    className="shrink-0 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 disabled:opacity-30"
                    title={`Restore v${snap.version}`}
                  >
                    {isRestoring ? "Restoring…" : "Restore"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
