// EditorShell — client component that boots stores and renders the editor layout.
// This is a "client boundary" — everything it imports runs in the browser.

"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useFlowStore } from "@/store/flow-store";
import { useProjectStore } from "@/store/project-store";
import { useUIStore } from "@/store/ui-store";
import { useCodeStore } from "@/store/code-store";
import { useBuildStore } from "@/store/build-store";
import { focusNode } from "@/lib/rf-instance";
import { NodePalette } from "@/components/editor/NodePalette";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import { CodePreview } from "@/components/editor/CodePreview";
import { VersionHistoryPanel } from "@/components/editor/VersionHistoryPanel";
import { BuildConsole } from "@/components/editor/BuildConsole";
import { BuildErrors } from "@/components/editor/BuildErrors";
import { TestResultsPanel } from "@/components/editor/TestResultsPanel";
import { IDLPanel } from "@/components/editor/IDLPanel";
import { SDKPanel } from "@/components/editor/SDKPanel";
import { PluginsPanel } from "@/components/editor/PluginsPanel";
import { AccountStateInspector } from "@/components/editor/AccountStateInspector";
import { TransactionBuilderPanel } from "@/components/editor/TransactionBuilderPanel";
import { ErrorBoundary } from "@/components/editor/ErrorBoundary";
import type { Node, Edge } from "@xyflow/react";
import { toast } from "sonner";
import type { AuditExportFormat, AuditReport } from "@solflow/audit";

// React Flow can't be SSR'd — load it dynamically with no SSR.
const FlowCanvas = dynamic(
  () =>
    import("@/components/editor/FlowCanvas").then((m) => ({
      default: m.FlowCanvas,
    })),
  { ssr: false, loading: () => <CanvasPlaceholder /> },
);

interface EditorShellProps {
  projectId: string;
  projectName: string;
  framework: "anchor" | "pinocchio" | "quasar";
  flowData: { nodes: Node[]; edges: Edge[] } | null;
}

export function EditorShell({
  projectId,
  projectName,
  framework,
  flowData,
}: EditorShellProps) {
  const { setFlow } = useFlowStore();
  const { setProject } = useProjectStore();
  const {
    paletteOpen,
    propertiesOpen,
    togglePalette,
    toggleProperties,
    bottomPanelOpen,
    bottomPanelTab,
    toggleBottomPanel,
    setBottomPanelTab,
    openBottomPanelTab,
  } = useUIStore();

  // ─── Audit state ──────────────────────────────────────────────────
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);

  // ─── Bottom panel resize state ────────────────────────────────────
  const [bottomPanelHeight, setBottomPanelHeight] = useState(256);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const onDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      dragCleanupRef.current?.();
      isDraggingRef.current = true;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      startYRef.current = clientY;
      startHeightRef.current = bottomPanelHeight;

      const onMove = (ev: MouseEvent | TouchEvent) => {
        if (!isDraggingRef.current) return;
        const cy = "touches" in ev ? ev.touches[0].clientY : ev.clientY;
        // Dragging UP increases panel height, DOWN decreases
        const delta = startYRef.current - cy;
        const next = Math.max(120, Math.min(window.innerHeight - 200, startHeightRef.current + delta));
        setBottomPanelHeight(next);
      };

      let cleanup = () => {};
      const onUp = () => {
        cleanup();
      };

      cleanup = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        dragCleanupRef.current = null;
      };

      dragCleanupRef.current = cleanup;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    },
    [bottomPanelHeight],
  );

  useEffect(() => {
    return () => dragCleanupRef.current?.();
  }, []);

  // ─── Boot stores with server-fetched data ──────────────────────────
  useEffect(() => {
    // Reset build state from any previous project
    useBuildStore.getState().reset();

    setProject({ id: projectId, name: projectName, framework });

    if (flowData) {
      setFlow(flowData.nodes ?? [], flowData.edges ?? []);
    }

    // Cleanup on unmount: disconnect WS, clear stale state
    return () => {
      import("@/lib/ws").then(({ disconnectWS }) => disconnectWS());
      useBuildStore.getState().reset();
      useCodeStore.getState().clear();
    };
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Audit: run instant audit on demand (button click) ──────
  const runInstantAudit = React.useCallback(async () => {
    const irJson = useCodeStore.getState().irJson;
    if (!irJson) {
      setAuditReport(null);
      return;
    }
    try {
      const { runInstantAudit: audit } = await import("@solflow/audit");
      const report = audit(irJson);
      setAuditReport(report);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Instant audit failed");
    }
  }, []);

  // ─── Auto-save: debounced save whenever isDirty flips to true ──────
  // Framework changes save fast (3s), normal edits save after 30s.
  // Auto-save NEVER creates version snapshots — only Ctrl+S does that.
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = useProjectStore.subscribe((state, prevState) => {
      if (!state.isDirty || state.isDirty === prevState.isDirty) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      const delay = state.urgentDirty ? 3_000 : 30_000;
      autoSaveTimerRef.current = setTimeout(() => {
        useProjectStore
          .getState()
          .save()
          .catch(() => toast.error("Auto-save failed"));
      }, delay);
    });
    return () => {
      unsub();
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    switch (e.key) {
      case "s":
        e.preventDefault();
        useProjectStore
          .getState()
          .save({ snapshot: true })
          .catch(() => toast.error("Failed to save"));
        break;
      case "a":
        e.preventDefault();
        useFlowStore.getState().selectAllNodes();
        break;
      case "1":
        e.preventDefault();
        useUIStore.getState().openBottomPanelTab("code");
        break;
      case "2":
        e.preventDefault();
        useUIStore.getState().openBottomPanelTab("console");
        break;
      case "b":
        e.preventDefault();
        useUIStore.getState().toggleBottomPanel();
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("templateForked") !== "1") return;
    openBottomPanelTab("code");
    toast.success("Template forked. Compile, Audit, and Test are ready from the bottom panel.");
    params.delete("templateForked");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, [openBottomPanelTab]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ─── Top bar ─────────────────────────────────────────────── */}
      <EditorTopBar />

      {/* ─── Main area ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node Palette */}
        {paletteOpen && <NodePalette />}

        {/* Canvas */}
        <div className="relative flex-1 overflow-hidden">
          {/* Toggle palette button (when hidden) */}
          {!paletteOpen && (
            <button
              onClick={togglePalette}
              className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-xs text-muted-foreground hover:bg-accent"
              title="Show node palette"
            >
              ›
            </button>
          )}

          {/* Toggle properties button (when hidden) */}
          {!propertiesOpen && (
            <button
              onClick={toggleProperties}
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-xs text-muted-foreground hover:bg-accent"
              title="Show properties panel"
            >
              ‹
            </button>
          )}

          <ErrorBoundary label="Canvas">
            <FlowCanvas />
          </ErrorBoundary>
        </div>
        {propertiesOpen && <PropertiesPanel />}
      </div>

      {/* ─── Bottom panel ────────────────────────────────────────── */}
      {bottomPanelOpen && (
        <div className="flex shrink-0 flex-col border-t border-border bg-background" style={{ height: bottomPanelHeight }}>
          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            className="group relative flex shrink-0 h-2 cursor-ns-resize items-center justify-center bg-card hover:bg-accent/50 transition-colors"
            title="Drag to resize"
          >
            <div className="h-0.5 w-8 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
          </div>
          {/* Tab bar */}
          <div className="flex shrink-0 items-center gap-0 border-b border-border bg-card overflow-x-auto whitespace-nowrap scrollbar-hide [&::-webkit-scrollbar]:hidden">
            {(
              [
                "code",
                "console",
                "errors",
                "tests",
                "audit",
                "history",
                "idl",
                "sdk",
                "plugins",
                "inspector",
                "txbuilder",
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setBottomPanelTab(tab)}
                className={`shrink-0 px-4 py-1.5 text-xs capitalize transition-colors ${
                  bottomPanelTab === tab
                    ? "border-b-2 border-primary bg-background text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground border-b-2 border-transparent"
                }`}
              >
                {tab === "txbuilder" ? "Tx Builder" : tab}
              </button>
            ))}
            {/* Close button */}
            <div className="sticky right-0 ml-auto flex shrink-0 items-center bg-card pl-2 pr-1 shadow-[-8px_0_8px_-4px_rgba(0,0,0,0.3)]">
              <button
                onClick={toggleBottomPanel}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Close panel (Ctrl+B)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary label="Code panel">
              {bottomPanelTab === "code" && <CodePreview />}
              {bottomPanelTab === "console" && <BuildConsole />}
              {bottomPanelTab === "errors" && <BuildErrors />}
              {bottomPanelTab === "tests" && <TestResultsPanel />}
              {bottomPanelTab === "audit" && (
                <AuditPanel
                  report={auditReport}
                  projectId={projectId}
                  framework={framework}
                  onRunInstantAudit={runInstantAudit}
                  onGoToNode={async (nodeId) => {
                    const store = useFlowStore.getState();
                    let targetId = store.nodes.find((node) => node.id === nodeId)?.id;
                    if (!targetId) {
                      const { flowNodeIdToIrId } = await import("@solflow/ir");
                      targetId = store.nodes.find((node) => flowNodeIdToIrId(node.id) === nodeId)?.id;
                    }
                    if (!targetId) {
                      toast.error("That audit target is no longer on the canvas");
                      return;
                    }
                    useFlowStore.getState().setSelectedNode(targetId);
                    requestAnimationFrame(() => focusNode(targetId));
                  }}
                  onGoToCode={({ nodeId, token }) => {
                    const codeStore = useCodeStore.getState();
                    if (!codeStore.generatedCode?.files.length) {
                      toast.error("Generate code first, then jump to the source section");
                      return;
                    }
                    codeStore.focusCodeTarget({ nodeId, token });
                    openBottomPanelTab("code");
                  }}
                  onFix={async (finding) => {
                    const { getRuleById } = await import("@solflow/audit");
                    const rule = getRuleById(finding.ruleId);
                    const ir = useCodeStore.getState().irJson;
                    if (!rule?.autoFix || !ir)
                      return;
                    const patches = rule.autoFix(
                      ir,
                      finding,
                    );
                    for (const patch of patches) {
                      useFlowStore
                        .getState()
                        .updateNodeData(patch.nodeId, patch.data);
                    }
                    toast.success(`Auto-fix applied for ${finding.ruleId}`);
                  }}
                  onFullAuditResult={(serverReport) => {
                    setAuditReport((prev) => {
                      if (!prev) return serverReport;
                      // Merge server findings on top of local
                      return {
                        ...serverReport,
                        findings: [
                          ...prev.findings.filter(
                            (f) =>
                              !serverReport.findings.some(
                                (sf) =>
                                  sf.ruleId === f.ruleId &&
                                  sf.location.instructionName ===
                                    f.location.instructionName,
                              ),
                          ),
                          ...serverReport.findings,
                        ],
                      };
                    });
                  }}
                />
              )}
              {bottomPanelTab === "history" && (
                <VersionHistoryPanel projectId={projectId} />
              )}
              {bottomPanelTab === "idl" && <IDLPanel />}
              {bottomPanelTab === "sdk" && <SDKPanel />}
              {bottomPanelTab === "plugins" && <PluginsPanel />}
              {bottomPanelTab === "inspector" && <AccountStateInspector />}
              {bottomPanelTab === "txbuilder" && <TransactionBuilderPanel />}
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* Open bottom panel toggle (when closed) */}
      {!bottomPanelOpen && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-3 py-1">
          <button
            onClick={toggleBottomPanel}
            className="text-xs text-muted-foreground hover:text-foreground"
            title="Open code panel (Ctrl+B)"
          >
            Code
          </button>
          <span className="text-muted-foreground/40 text-xs">Ctrl+B</span>
        </div>
      )}
    </div>
  );
}

// ─── Audit Panel ──────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<
  string,
  { dot: string; badge: string; label: string }
> = {
  critical: {
    dot: "bg-red-500",
    badge: "bg-red-500/10 text-red-400 border-red-500/30",
    label: "CRITICAL",
  },
  high: {
    dot: "bg-orange-500",
    badge: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    label: "HIGH",
  },
  medium: {
    dot: "bg-yellow-500",
    badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    label: "MEDIUM",
  },
  low: {
    dot: "bg-blue-500",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    label: "LOW",
  },
  info: {
    dot: "bg-muted-foreground",
    badge: "bg-muted/30 text-muted-foreground border-border",
    label: "INFO",
  },
};

function AuditPanel({
  report,
  projectId,
  framework,
  onGoToNode,
  onGoToCode,
  onFix,
  onFullAuditResult,
  onRunInstantAudit,
}: {
  report: AuditReport | null;
  projectId: string;
  framework: "anchor" | "pinocchio" | "quasar";
  onGoToNode?: (nodeId: string) => void;
  onGoToCode?: (target: { nodeId?: string; token?: string }) => void;
  onFix?: (finding: import("@solflow/audit").AuditFinding) => void;
  onFullAuditResult?: (report: AuditReport) => void;
  onRunInstantAudit?: () => void;
}) {
  const [instantAuditLoading, setInstantAuditLoading] = React.useState(false);
  const [fullAuditLoading, setFullAuditLoading] = React.useState(false);

  const handleInstantAudit = React.useCallback(async () => {
    if (!onRunInstantAudit) return;
    setInstantAuditLoading(true);
    try {
      await onRunInstantAudit();
    } finally {
      setInstantAuditLoading(false);
    }
  }, [onRunInstantAudit]);

  const runFullAudit = React.useCallback(async () => {
    setFullAuditLoading(true);
    try {
      const { getVanillaClient } = await import("@/lib/trpc/client");
      const client = getVanillaClient();
      const result = await client.audit.run.mutate({ projectId });
      if (onFullAuditResult && result.findings) {
        onFullAuditResult({
          findings: result.findings as import("@solflow/audit").AuditFinding[],
          score: result.score ?? 100,
          summary: result.summary ?? {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          },
          stressTests: result.stressTests ?? [],
          stressSummary: result.stressSummary ?? {
            total: 0,
            bySeverity: {
              critical: 0,
              high: 0,
              medium: 0,
              low: 0,
              info: 0,
            },
            byCategory: {
              "input-boundary": 0,
              "arithmetic-boundary": 0,
              "require-boundary": 0,
              "account-validation": 0,
              "pda-validation": 0,
              "token-validation": 0,
              "cpi-validation": 0,
            },
          },
          fixSuggestions: result.fixSuggestions ?? [],
        });
      }
      const { toast: toastFn } = await import("sonner");
      toastFn.success(
        result.externalCount
          ? `Full audit complete — ${result.externalCount} external findings merged`
          : "Full audit complete",
      );
    } catch (e) {
      const { toast: toastFn } = await import("sonner");
      toastFn.error(e instanceof Error ? e.message : "Full audit failed");
    } finally {
      setFullAuditLoading(false);
    }
  }, [projectId, onFullAuditResult]);

  const exportReport = React.useCallback(
    async (format: Extract<AuditExportFormat, "markdown" | "sarif" | "json">) => {
      if (!report) return;
      const { formatAuditReport } = await import("@solflow/audit");
      const ext = format === "markdown" ? "md" : format;
      const content = formatAuditReport(report, format, {
        projectName: projectId,
        framework,
      });
      downloadTextFile(`solstudio-audit.${ext}`, content);
      toast.success(`Audit ${format} exported`);
    },
    [framework, projectId, report],
  );

  const generateTests = React.useCallback(async () => {
    if (!report) return;
    const { generateAuditTestFiles } = await import("@solflow/audit");
    const ir = useCodeStore.getState().irJson;
    const files = generateAuditTestFiles(report, {
      framework,
      programName: ir?.program?.name,
      includeReadme: true,
    });
    for (const file of files) {
      downloadTextFile(file.path.replace(/\//g, "__"), file.content);
    }
    toast.success(`Downloaded ${files.length} audit test file(s). Full Export also includes tests.`);
  }, [framework, report]);

  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>
          Click below to run a security audit on your program.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleInstantAudit}
            disabled={instantAuditLoading}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {instantAuditLoading ? "Running…" : "Run Instant Audit"}
          </button>
          <button
            onClick={runFullAudit}
            disabled={fullAuditLoading}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            {fullAuditLoading ? "Running…" : "Run Full Audit"}
          </button>
        </div>
      </div>
    );
  }

  const stressTests = report.stressTests ?? [];
  const stressTotal = report.stressSummary?.total ?? stressTests.length;

  if (report.findings.length === 0 && stressTests.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
        <div className="text-2xl">✓</div>
        <p className="font-medium text-green-400">No issues found</p>
        <p className="text-muted-foreground">Score: {report.score}/100</p>
      </div>
    );
  }

  const scoreColor =
    report.score >= 80
      ? "text-green-400"
      : report.score >= 60
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex shrink-0 items-center gap-4 border-b border-border px-4 py-2">
        <span className={`text-sm font-semibold ${scoreColor}`}>
          Score: {report.score}/100
        </span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {report.summary.critical > 0 && (
            <span className="text-red-400">
              {report.summary.critical} critical
            </span>
          )}
          {report.summary.high > 0 && (
            <span className="text-orange-400">{report.summary.high} high</span>
          )}
          {report.summary.medium > 0 && (
            <span className="text-yellow-400">
              {report.summary.medium} medium
            </span>
          )}
          {report.summary.low > 0 && (
            <span className="text-blue-400">{report.summary.low} low</span>
          )}
          {report.summary.info > 0 && (
            <span className="text-muted-foreground">
              {report.summary.info} info
            </span>
          )}
          {stressTotal > 0 && (
            <span className="text-cyan-400">
              {stressTotal} stress
            </span>
          )}
        </div>
        <button
          onClick={runFullAudit}
          disabled={fullAuditLoading}
          className="ml-auto rounded bg-primary/90 px-3 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary disabled:opacity-50"
        >
          {fullAuditLoading ? "Running…" : "Run Full Audit"}
        </button>
        <button
          onClick={generateTests}
          className="rounded border border-cyan-500/40 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/10"
        >
          Download Tests
        </button>
        <button
          onClick={() => exportReport("markdown")}
          className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Export MD
        </button>
        <button
          onClick={() => exportReport("sarif")}
          className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          SARIF
        </button>
      </div>

      {/* Findings list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="divide-y divide-border">
          {stressTests.length > 0 && (
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Deterministic Stress</div>
                  <div className="text-[11px] text-muted-foreground">
                    {stressTests.length} generated edge-case probes
                  </div>
                </div>
                <button
                  onClick={() => {
                    const copy = navigator.clipboard?.writeText(
                      JSON.stringify(stressTests, null, 2),
                    );
                    if (!copy) {
                      toast.error("Copy failed");
                      return;
                    }
                    void copy
                      .then(() => toast.success("Stress cases copied"))
                      .catch(() => toast.error("Copy failed"));
                  }}
                  className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Copy JSON
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {stressTests.slice(0, 12).map((test) => {
                  const colors =
                    SEVERITY_COLORS[test.severity] ?? SEVERITY_COLORS.info;
                  return (
                    <div
                      key={test.id}
                      className="rounded border border-border bg-background/40 p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${colors.badge}`}
                        >
                          {colors.label}
                        </span>
                        <span className="truncate text-xs font-medium">
                          {test.title}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">{test.instructionName}</span>
                        <span>{test.category}</span>
                        <span>expected: {test.expected}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {test.rationale}
                      </p>
                      {test.nodeId && onGoToNode && (
                        <button
                          onClick={() => onGoToNode(test.nodeId!)}
                          className="mt-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          Go to Node
                        </button>
                      )}
                      {onGoToCode && (
                        <button
                          onClick={() =>
                            onGoToCode({
                              nodeId: test.nodeId,
                              token: test.instructionName,
                            })
                          }
                          className="mt-1 ml-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          Go to Code
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {stressTests.length > 12 && (
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Showing 12 of {stressTests.length}
                </div>
              )}
            </div>
          )}
          {report.findings.length === 0 && (
            <div className="px-4 py-3 text-xs text-green-400">
              No static findings.
            </div>
          )}
          {report.findings.map((finding, idx) => {
            const colors =
              SEVERITY_COLORS[finding.severity] ?? SEVERITY_COLORS.info;
            return (
              <div key={`${finding.ruleId}-${idx}`} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${colors.dot}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${colors.badge}`}
                      >
                        {colors.label}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {finding.ruleId}
                      </span>
                      <span className="text-sm font-medium">
                        {finding.title}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {finding.description}
                    </p>
                    <p className="mt-1 text-xs text-foreground/80">
                      <span className="font-medium">Fix: </span>
                      {finding.recommendation}
                    </p>
                    {finding.location.instructionName && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/60 font-mono">
                        instruction: {finding.location.instructionName}
                        {finding.location.accountName &&
                          ` › ${finding.location.accountName}`}
                      </p>
                    )}
                    {finding.location.nodeId && onGoToNode && (
                      <button
                        onClick={() => onGoToNode(finding.location.nodeId!)}
                        className="mt-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        Go to Node
                      </button>
                    )}
                    {onGoToCode && (
                      <button
                        onClick={() =>
                          onGoToCode({
                            nodeId: finding.location.nodeId,
                            token:
                              finding.location.instructionName ??
                              finding.location.accountName ??
                              finding.title,
                          })
                        }
                        className="mt-1 ml-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        Go to Code
                      </button>
                    )}
                    {onFix && (
                      <button
                        onClick={() => onFix(finding)}
                        className="mt-1 ml-1 rounded border border-green-500/40 px-2 py-0.5 text-[10px] text-green-400 hover:bg-green-500/10"
                      >
                        Apply Fix
                      </button>
                    )}
                    {report.fixSuggestions?.find(
                      (fix) =>
                        fix.ruleId === finding.ruleId &&
                        fix.nodeId === finding.location.nodeId,
                    ) && (
                      <p className="mt-1 text-[10px] text-green-300/80">
                        {
                          report.fixSuggestions.find(
                            (fix) =>
                              fix.ruleId === finding.ruleId &&
                              fix.nodeId === finding.location.nodeId,
                          )?.graphAction
                        }
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CanvasPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="text-sm">Loading canvas…</p>
      </div>
    </div>
  );
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
