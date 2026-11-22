// EditorShell — client component that boots stores and renders the editor layout.
// This is a "client boundary" — everything it imports runs in the browser.

"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useFlowStore, undoFlow, redoFlow } from "@/store/flow-store";
import { useProjectStore } from "@/store/project-store";
import { installUnloadGuard, startAutoSave } from "@/store/save-guards";
import { startPluginAuditRuleSync } from "@/store/plugin-store";
import { isEditableShortcutTarget, resolveEditorShortcut } from "@/hooks/editor-shortcuts";
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
import { edChipBtn, edIconBtn, edKbd, edPrimaryBtn, edBtn, edx } from "@/components/ui-kit/editor-ui";
import { PanelLeftOpen, PanelRightOpen, X as XIcon, ChevronUp, ShieldCheck } from "lucide-react";
import "@/components/editor/editor.css";
import type { Node, Edge } from "@xyflow/react";
import {
  EditorAiAssistant,
  type EditorAiAssistantPromptInput,
  type EditorAssistantContext,
} from "@solflow/ui";
import { toast } from "sonner";
import type { AuditExportFormat, AuditFinding, AuditReport } from "@solflow/audit";
import { fixableRuleIds } from "@/components/editor/audit-fix";

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

function getEditorNodeLabel(node: Node | undefined): string | null {
  if (!node) return null;
  const data = node.data as Record<string, unknown> | undefined;
  const label = data?.label ?? data?.name ?? data?.title;
  if (typeof label === "string" && label.trim()) return label;
  if (typeof node.type === "string" && node.type.trim()) return node.type;
  return node.id;
}

async function askEditorAssistant(input: EditorAiAssistantPromptInput) {
  const response = await fetch("/api/editor-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    reply?: string;
    source?: string;
    error?: string;
    warning?: string;
  };

  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? "Assistant request failed");
  }

  if (payload.reply && payload.reply.trim()) {
    return payload.reply;
  }

  throw new Error("Assistant returned an empty response");
}

export function EditorShell({
  projectId,
  projectName,
  framework,
  flowData,
}: EditorShellProps) {
  const loadFlow = useFlowStore((s) => s.loadFlow);
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
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const isDirty = useProjectStore((s) => s.isDirty);

  // ─── Audit state ──────────────────────────────────────────────────
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [fixableIds, setFixableIds] = useState<Set<string>>(() => new Set());

  // Only findings whose rule has an autoFix get an "Apply Fix" button.
  useEffect(() => {
    if (!auditReport) {
      setFixableIds(new Set());
      return;
    }
    let cancelled = false;
    void import("@solflow/audit").then(({ getRuleById }) => {
      if (!cancelled) setFixableIds(fixableRuleIds(auditReport.findings, getRuleById));
    });
    return () => {
      cancelled = true;
    };
  }, [auditReport]);

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

  const assistantContext = React.useMemo<EditorAssistantContext>(() => {
    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    return {
      surface: "web",
      projectName,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      selectedNodeLabel: getEditorNodeLabel(selectedNode),
      dirty: isDirty,
    };
  }, [edges.length, isDirty, nodes, projectName, selectedNodeId]);

  // ─── Boot stores with server-fetched data ──────────────────────────
  useEffect(() => {
    // Reset build state from any previous project
    useBuildStore.getState().reset();

    setProject({ id: projectId, name: projectName, framework });

    // Always replace the canvas (even with an empty project) and start a
    // fresh undo history, so undo can't step back into the previous project.
    loadFlow(flowData?.nodes ?? [], flowData?.edges ?? []);

    // A reload mid-deploy picks the deploy back up (and shows its progress).
    void useBuildStore.getState().resumeDeploy(projectId);

    // Cleanup on unmount: disconnect WS, clear stale state
    return () => {
      import("@/lib/ws").then(({ disconnectWS }) => disconnectWS());
      useBuildStore.getState().reset();
      useFlowStore.getState().clearFlow();
      useFlowStore.temporal.getState().clear();
    };
    // Run once on mount only
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

  // ─── Auto-save + unload guard ──────────────────────────────────────
  // Framework changes save fast (3s), normal edits after the interval set in
  // Settings (0 = off). Auto-save NEVER creates version snapshots — only Ctrl+S does.
  useEffect(() => {
    const stopAutoSave = startAutoSave(() => toast.error("Auto-save failed"));
    const removeUnloadGuard = installUnloadGuard();
    return () => {
      stopAutoSave();
      removeUnloadGuard();
    };
  }, []);

  // ─── Plugin audit rules: register enabled plugins' rules at load ───
  useEffect(() => startPluginAuditRuleSync(), []);

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const action = resolveEditorShortcut(e, isEditableShortcutTarget(e.target));
    if (!action) return;

    switch (action) {
      case "copy":
        if (useFlowStore.getState().copySelectedNodes()) e.preventDefault();
        break;
      case "paste":
        if (useFlowStore.getState().pasteCopiedNodes()) e.preventDefault();
        break;
      case "save":
        e.preventDefault();
        useProjectStore
          .getState()
          .save({ snapshot: true })
          .catch(() => toast.error("Failed to save"));
        break;
      case "selectAll":
        e.preventDefault();
        useFlowStore.getState().selectAllNodes();
        break;
      case "undo":
        e.preventDefault();
        undoFlow();
        break;
      case "redo":
        e.preventDefault();
        redoFlow();
        break;
      case "codeTab":
        e.preventDefault();
        useUIStore.getState().openBottomPanelTab("code");
        break;
      case "consoleTab":
        e.preventDefault();
        useUIStore.getState().openBottomPanelTab("console");
        break;
      case "toggleBottomPanel":
        e.preventDefault();
        useUIStore.getState().toggleBottomPanel();
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
    <div className="ss-editor flex h-screen flex-col overflow-hidden bg-background text-[13px] text-foreground">
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
              className={edx(edIconBtn, "absolute left-3 top-3 z-10 border border-white/[0.08] bg-popover shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]")}
              title="Show node palette"
              aria-label="Show node palette"
            >
              <PanelLeftOpen size={14} />
            </button>
          )}

          {/* Toggle properties button (when hidden) */}
          {!propertiesOpen && (
            <button
              onClick={toggleProperties}
              className={edx(edIconBtn, "absolute right-3 top-3 z-10 border border-white/[0.08] bg-popover shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]")}
              title="Show properties panel"
              aria-label="Show properties panel"
            >
              <PanelRightOpen size={14} />
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
        <div className="relative flex shrink-0 flex-col border-t border-border bg-card" style={{ height: bottomPanelHeight }}>
          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            className="group absolute inset-x-0 -top-1 z-10 flex h-2 cursor-ns-resize items-center justify-center"
            title="Drag to resize"
          >
            <div className="h-px w-full bg-transparent transition-colors duration-150 ease-out group-hover:bg-primary/60" />
          </div>
          {/* Tab bar */}
          <div role="tablist" aria-label="Bottom panel" className="flex h-9 shrink-0 items-stretch gap-0 overflow-x-auto whitespace-nowrap border-b border-border bg-card px-1 scrollbar-hide [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                role="tab"
                aria-selected={bottomPanelTab === tab}
                data-active={bottomPanelTab === tab}
                className={`ss-ed-tab relative shrink-0 rounded-md px-2.5 text-[12px] font-medium capitalize outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                  bottomPanelTab === tab
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "txbuilder" ? "Tx Builder" : tab === "idl" ? "IDL" : tab === "sdk" ? "SDK" : tab}
              </button>
            ))}
            {/* Close button */}
            <div className="sticky right-0 ml-auto flex shrink-0 items-center gap-1.5 bg-card pl-3 pr-1 shadow-[-12px_0_12px_-6px_rgba(0,0,0,0.5)]">
              <kbd className={edx(edKbd, "hidden md:inline-flex")}>Ctrl B</kbd>
              <button
                onClick={toggleBottomPanel}
                className={edIconBtn}
                title="Close panel (Ctrl+B)"
                aria-label="Close panel"
              >
                <XIcon size={14} />
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-hidden bg-background">
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
                  canFix={(finding) => fixableIds.has(finding.ruleId)}
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
                    if (!rule?.autoFix || !ir) {
                      toast.error(`No automatic fix for ${finding.ruleId}`);
                      return;
                    }
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
        <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border bg-card px-1.5">
          <button
            onClick={toggleBottomPanel}
            className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            title="Open code panel (Ctrl+B)"
          >
            <ChevronUp size={13} />
            Code
          </button>
          <kbd className={edKbd}>Ctrl B</kbd>
        </div>
      )}

      <EditorAiAssistant context={assistantContext} onPrompt={askEditorAssistant} />
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
  canFix,
}: {
  report: AuditReport | null;
  projectId: string;
  framework: "anchor" | "pinocchio" | "quasar";
  onGoToNode?: (nodeId: string) => void;
  onGoToCode?: (target: { nodeId?: string; token?: string }) => void;
  onFix?: (finding: AuditFinding) => void;
  onFullAuditResult?: (report: AuditReport) => void;
  onRunInstantAudit?: () => void;
  canFix?: (finding: AuditFinding) => boolean;
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
      // The server audits the saved project: save pending edits first.
      await useProjectStore.getState().saveIfDirty();
      const { getVanillaClient } = await import("@/lib/trpc/client");
      const client = getVanillaClient();
      const result = await client.audit.run.mutate({ projectId });
      if (onFullAuditResult && result.findings) {
        onFullAuditResult({
          findings: result.findings as AuditFinding[],
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
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <ShieldCheck size={16} />
        </span>
        <p className="text-[13px] text-muted-foreground">
          Click below to run a security audit on your program.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleInstantAudit}
            disabled={instantAuditLoading}
            className={edPrimaryBtn}
          >
            {instantAuditLoading ? "Running…" : "Run Instant Audit"}
          </button>
          <button
            onClick={runFullAudit}
            disabled={fullAuditLoading}
            className={edBtn}
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
      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[13px]">
        <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-[10px] border border-green-500/20 bg-green-500/10 text-green-400">
          <ShieldCheck size={16} />
        </span>
        <p className="font-medium text-green-400">No issues found</p>
        <p className="font-mono text-[12px] text-muted-foreground">Score: {report.score}/100</p>
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
      <div className="flex h-10 shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3 [scrollbar-width:none]">
        <span className={`shrink-0 font-mono text-[12px] font-semibold tabular-nums ${scoreColor}`}>
          Score: {report.score}/100
        </span>
        <div className="flex shrink-0 items-center gap-3 text-[12px] tabular-nums text-muted-foreground">
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
          className={edx(edPrimaryBtn, "ml-auto h-6 px-2.5 text-[11px]")}
        >
          {fullAuditLoading ? "Running…" : "Run Full Audit"}
        </button>
        <button
          onClick={generateTests}
          className={edChipBtn}
        >
          Download Tests
        </button>
        <button
          onClick={() => exportReport("markdown")}
          className={edChipBtn}
        >
          Export MD
        </button>
        <button
          onClick={() => exportReport("sarif")}
          className={edChipBtn}
        >
          SARIF
        </button>
      </div>

      {/* Findings list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="divide-y divide-border">
          {stressTests.length > 0 && (
            <div className="px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-semibold">Deterministic Stress</div>
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
                  className={edChipBtn}
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
                      className="rounded-lg border border-white/[0.07] bg-card p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-[18px] items-center rounded-[4px] border px-1.5 text-[10px] font-semibold tracking-[0.02em] ${colors.badge}`}
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
                          className={edx(edChipBtn, "mt-1.5")}
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
                          className={edx(edChipBtn, "mt-1.5 ml-1")}
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
            <div className="px-3 py-3 text-[12px] text-green-400">
              No static findings.
            </div>
          )}
          {report.findings.map((finding, idx) => {
            const colors =
              SEVERITY_COLORS[finding.severity] ?? SEVERITY_COLORS.info;
            return (
              <div key={`${finding.ruleId}-${idx}`} className="px-3 py-2.5 transition-colors duration-150 hover:bg-white/[0.02]">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${colors.dot}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex h-[18px] items-center rounded-[4px] border px-1.5 text-[10px] font-semibold tracking-[0.02em] ${colors.badge}`}
                      >
                        {colors.label}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {finding.ruleId}
                      </span>
                      <span className="text-[13px] font-medium">
                        {finding.title}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">
                      {finding.description}
                    </p>
                    <p className="mt-1 text-[12px] leading-[1.5] text-foreground/80">
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
                        className={edx(edChipBtn, "mt-1.5")}
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
                        className={edx(edChipBtn, "mt-1.5 ml-1")}
                      >
                        Go to Code
                      </button>
                    )}
                    {onFix && canFix?.(finding) && (
                      <button
                        onClick={() => onFix(finding)}
                        className={edx(edChipBtn, "mt-1.5 ml-1 text-green-400 shadow-[0_0_0_1px_rgba(74,222,128,0.3)] hover:text-green-300")}
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
    <div className="flex h-full w-full items-center justify-center bg-[#0b0c0f]">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-primary motion-reduce:animate-none" />
        <p className="text-[12px]">Loading canvas…</p>
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
