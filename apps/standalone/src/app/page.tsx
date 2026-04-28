"use client";

// Standalone editor page — matches the web editor layout pixel-for-pixel.
// Uses REST API + WebSocket instead of tRPC for data loading/saving.

import React, { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { Node, Edge } from "@xyflow/react";
import {
  Workflow,
  Save,
  Loader2,
  RotateCcw,
  RotateCw,
  Upload,
  Download,
  History,
  Play,
  Hammer,
  Rocket,
  CheckCircle,
  XCircle,
  Shield,
  Settings,
  Globe,
  Wallet,
  X,
  RefreshCw,
} from "lucide-react";
import { useFlowStore } from "@/web/store/flow-store";
import { useUIStore } from "@/web/store/ui-store";
import { toast } from "sonner";
import { loadProject, saveProject, fetchSourceFiles, saveSourceFile, reparseProject } from "../lib/standalone-api";
import type { ParseReport, SourceFile } from "../lib/standalone-api";
import "../lib/tailwind-safelist";

// React Flow can't be SSR'd
const FlowCanvas = dynamic(
  () =>
    import("@/web/components/editor/FlowCanvas").then((m) => ({
      default: m.FlowCanvas,
    })),
  { ssr: false, loading: () => <CanvasPlaceholder /> },
);

const NodePalette = dynamic(
  () =>
    import("@/web/components/editor/NodePalette").then((m) => ({
      default: m.NodePalette,
    })),
  { ssr: false },
);

const PropertiesPanel = dynamic(
  () =>
    import("@/web/components/editor/PropertiesPanel").then((m) => ({
      default: m.PropertiesPanel,
    })),
  { ssr: false },
);

// Monaco editor for source code editing (loaded dynamically, no SSR)
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <PanelPlaceholder text="Loading editor..." />,
});

// Configure Monaco to load from CDN
if (typeof window !== "undefined") {
  import("@monaco-editor/react").then(({ loader }) => {
    loader.config({
      paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs" },
    });
  });
}

// ─── Build state ────────────────────────────────────────────────────────

type BuildStatus = "idle" | "running" | "success" | "error";

interface BuildOutput {
  success?: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function StandalonePage() {
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [projectName, setProjectName] = useState("SolStudio");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const [framework, setFramework] = useState<"anchor" | "pinocchio" | "quasar">("anchor");
  const [isSaving, setIsSaving] = useState(false);
  const [network, setNetwork] = useState<string>("localnet");
  const [detectedFramework, setDetectedFramework] = useState<string>("unknown");
  const [parseReport, setParseReport] = useState<ParseReport | null>(null);

  // Build state
  const [compileStatus, setCompileStatus] = useState<BuildStatus>("idle");
  const [testStatus, setTestStatus] = useState<BuildStatus>("idle");
  const [deployStatus, setDeployStatus] = useState<BuildStatus>("idle");
  const [consoleOutput, setConsoleOutput] = useState<string>("");
  const [testOutput, setTestOutput] = useState<string>("");

  const { nodes, edges, setFlow } = useFlowStore();
  const {
    paletteOpen,
    propertiesOpen,
    togglePalette,
    toggleProperties,
    bottomPanelOpen,
    bottomPanelTab,
    toggleBottomPanel,
    setBottomPanelTab,
  } = useUIStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRemoteUpdate = useRef(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(256);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Load initial project data
  useEffect(() => {
    Promise.all([
      loadProject(),
      fetch(`${window.location.origin}/api/status`).then((r) => r.json()).catch(() => ({})),
    ])
      .then(async ([data, statusData]) => {
        if (data.name) {
          setProjectName(data.name);
          setNameInput(data.name);
        }
        if (data.framework) setFramework(data.framework as typeof framework);
        if (data.report) setParseReport(data.report);
        if (statusData.projectType) setDetectedFramework(statusData.projectType);
        if (data.nodes?.length) {
          isRemoteUpdate.current = true;
          setFlow(data.nodes, data.edges ?? []);
        } else {
          // No nodes — trigger a re-parse from source
          try {
            const parsed = await reparseProject();
            if (parsed.nodes?.length) {
              isRemoteUpdate.current = true;
              setFlow(parsed.nodes, parsed.edges ?? []);
              setParseReport(parsed.report ?? null);
            }
          } catch { /* parse failed, show empty canvas */ }
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, [setFlow]);

  // Auto-save with debounce
  useEffect(() => {
    if (!loaded || isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProject({ nodes, edges })
        .then(() => setStatus("Saved"))
        .catch(() => setStatus("Save failed"));
      saveTimer.current = null;
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, loaded]);

  // WebSocket listener
  useEffect(() => {
    if (!loaded) return;
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "flow-updated") {
              loadProject()
                .then((data) => {
                  isRemoteUpdate.current = true;
                  setFlow(data.nodes ?? [], data.edges ?? []);
                  setParseReport(data.report ?? null);
                  setStatus(`Updated: ${msg.nodes || 0} nodes`);
                })
                .catch(() => setStatus("Reload failed"));
            } else if (msg.type === "compile-done") {
              setCompileStatus(msg.success ? "success" : "error");
            } else if (msg.type === "test-done") {
              setTestStatus(msg.success ? "success" : "error");
            } else if (msg.type === "deploy-done") {
              setDeployStatus(msg.success ? "success" : "error");
            }
          } catch { /* ignore */ }
        };
        ws.onclose = () => { reconnectTimer = setTimeout(connect, 3000); };
        ws.onerror = () => ws?.close();
      } catch { /* ws not available */ }
    }
    connect();
    return () => {
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [loaded, setFlow]);

  // Bottom panel resize
  const onDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      startYRef.current = clientY;
      startHeightRef.current = bottomPanelHeight;
      const onMove = (ev: MouseEvent | TouchEvent) => {
        if (!isDraggingRef.current) return;
        const cy = "touches" in ev ? ev.touches[0].clientY : ev.clientY;
        const delta = startYRef.current - cy;
        setBottomPanelHeight(Math.max(120, Math.min(window.innerHeight - 200, startHeightRef.current + delta)));
      };
      const onUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    },
    [bottomPanelHeight],
  );

  // Save handler
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveProject({ nodes, edges });
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges]);

  // Sync handler — force codegen from flow to source files
  const handleSync = useCallback(async () => {
    try {
      const res = await fetch(`${window.location.origin}/api/sync`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Synced ${data.written} file(s) to disk`);
      } else {
        toast.error(data.errors?.join(", ") || "Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    }
  }, []);

  // Editable project name
  const commitName = () => {
    setEditingName(false);
    if (nameInput.trim() && nameInput !== projectName) {
      setProjectName(nameInput.trim());
    } else {
      setNameInput(projectName);
    }
  };

  // ─── Local build commands ────────────────────────────────────────────

  const buildCmd = detectedFramework === "anchor" ? "anchor build" : "cargo build-sbf";
  const testCmd = detectedFramework === "anchor" ? "anchor test" : "cargo test";

  const runCompile = useCallback(async () => {
    setCompileStatus("running");
    setBottomPanelTab("console");
    setConsoleOutput(prev => prev + `\n\n$ ${buildCmd}\n`);
    try {
      const res = await fetch(`${window.location.origin}/api/compile`, { method: "POST" });
      const data: BuildOutput = await res.json();
      const output = (data.stdout || "") + (data.stderr ? "\n[stderr]\n" + data.stderr : "");
      setConsoleOutput(prev => prev + output + "\n");
      setCompileStatus(data.success ? "success" : "error");
      toast[data.success ? "success" : "error"](data.success ? "Build succeeded" : "Build failed");
    } catch (e) {
      setConsoleOutput(prev => prev + "\nCompile error: " + (e instanceof Error ? e.message : "Unknown error") + "\n");
      setCompileStatus("error");
      toast.error("Compile failed");
    }
  }, [setBottomPanelTab, buildCmd]);

  const runTest = useCallback(async () => {
    setTestStatus("running");
    setBottomPanelTab("tests");
    setTestOutput(`$ ${testCmd}\n`);
    try {
      const res = await fetch(`${window.location.origin}/api/test`, { method: "POST" });
      const data: BuildOutput = await res.json();
      const output = (data.stdout || "") + (data.stderr ? "\n[stderr]\n" + data.stderr : "");
      setTestOutput(output);
      setTestStatus(data.success ? "success" : "error");
      toast[data.success ? "success" : "error"](data.success ? "Tests passed" : "Tests failed");
    } catch (e) {
      setTestOutput("Test error: " + (e instanceof Error ? e.message : "Unknown error"));
      setTestStatus("error");
      toast.error("Test failed");
    }
  }, [setBottomPanelTab, testCmd]);

  const deployCmd = detectedFramework === "anchor" ? "anchor deploy" : "solana program deploy";

  const runDeploy = useCallback(async () => {
    setDeployStatus("running");
    setBottomPanelTab("console");
    try {
      const res = await fetch(`${window.location.origin}/api/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network }),
      });
      const data: BuildOutput = await res.json();
      setConsoleOutput(prev => prev + `\n\n$ ${deployCmd}\n` + (data.stdout || "") + (data.stderr || ""));
      setDeployStatus(data.success ? "success" : "error");
      toast[data.success ? "success" : "error"](data.success ? "Deployed!" : "Deploy failed");
    } catch (e) {
      setConsoleOutput(prev => prev + "\n\nDeploy error: " + (e instanceof Error ? e.message : "Unknown error"));
      setDeployStatus("error");
      toast.error("Deploy failed");
    }
  }, [network, setBottomPanelTab, deployCmd]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "s") { e.preventDefault(); handleSave(); }
      else if (e.key === "b") { e.preventDefault(); toggleBottomPanel(); }
      else if (e.key === "1") { e.preventDefault(); setBottomPanelTab("code"); }
      else if (e.key === "2") { e.preventDefault(); setBottomPanelTab("console"); }
      else if (e.key === "a") { e.preventDefault(); useFlowStore.getState().selectAllNodes(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleSave, toggleBottomPanel, setBottomPanelTab]);

  if (!loaded) return <LoadingScreen />;

  const undo = () => useFlowStore.temporal.getState().undo();
  const redo = () => useFlowStore.temporal.getState().redo();
  const canUndo = useFlowStore.temporal.getState().pastStates.length > 0;
  const canRedo = useFlowStore.temporal.getState().futureStates.length > 0;
  const isDirty = status === "Saving..." || status === "";

  // ─── Button icon helpers ──────────────────────────────────────────────

  const compileIcon = compileStatus === "running"
    ? <Loader2 size={12} className="animate-spin" />
    : compileStatus === "success" ? <CheckCircle size={12} className="text-green-400" />
    : compileStatus === "error" ? <XCircle size={12} className="text-red-400" />
    : <Hammer size={12} />;

  const testIcon = testStatus === "running"
    ? <Loader2 size={12} className="animate-spin" />
    : testStatus === "success" ? <CheckCircle size={12} className="text-green-400" />
    : testStatus === "error" ? <XCircle size={12} className="text-red-400" />
    : <Play size={12} />;

  const deployIcon = deployStatus === "running"
    ? <Loader2 size={12} className="animate-spin" />
    : deployStatus === "success" ? <CheckCircle size={12} className="text-green-400" />
    : deployStatus === "error" ? <XCircle size={12} className="text-red-400" />
    : <Rocket size={12} />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ─── Top bar — matches EditorTopBar exactly ──────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-3">
        {/* Left */}
        <div className="flex min-w-0 shrink items-center gap-2">
          <div className="flex items-center gap-1 text-muted-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <Workflow size={13} className="text-primary-foreground" />
            </div>
          </div>

          <span className="text-muted-foreground">/</span>

          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") { setNameInput(projectName); setEditingName(false); }
              }}
              className="h-7 rounded border border-primary bg-background px-2 text-sm font-medium outline-none focus:ring-1 focus:ring-primary"
              style={{ width: `${Math.max(nameInput.length + 2, 10)}ch` }}
            />
          ) : (
            <button
              onClick={() => { setNameInput(projectName); setEditingName(true); }}
              className="max-w-[60px] truncate rounded px-1 py-0.5 text-sm font-medium hover:bg-accent transition-colors"
              title={projectName}
            >
              {projectName}
            </button>
          )}

          <button
            title="Project settings"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Settings size={12} />
          </button>

          {isDirty && !isSaving && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
          )}

          {status && status !== "Saved" && (
            <span className="text-[10px] text-muted-foreground/50">{status}</span>
          )}
        </div>

        {/* Center */}
        <div className="flex shrink items-center gap-2">
          <button
            onClick={() => undo()}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <RotateCw size={13} />
          </button>

          <div className="mx-1 h-4 w-px bg-border" />
          <div className="mx-1 h-4 w-px bg-border" />

          {/* Framework toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["anchor", "pinocchio", "quasar"] as const).map((fw) => (
              <button
                key={fw}
                onClick={() => setFramework(fw)}
                className={`px-3 py-1 text-xs font-medium transition-colors capitalize ${
                  framework === fw
                    ? fw === "anchor"
                      ? "bg-blue-500/20 text-blue-400"
                      : fw === "pinocchio"
                        ? "bg-violet-500/20 text-violet-400"
                        : "bg-emerald-500/20 text-emerald-400"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {fw}
              </button>
            ))}
          </div>

          {/* Network selector */}
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="h-7 rounded-lg border border-border bg-card px-2 text-xs text-muted-foreground outline-none hover:border-border/80 focus:border-primary"
          >
            <option value="localnet">Localnet</option>
            <option value="devnet">Devnet</option>
            <option value="mainnet">Mainnet</option>
          </select>
        </div>

        {/* Right */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setBottomPanelTab("audit")}
            title="Audit history"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <History size={13} />
          </button>

          <button
            title="Export (coming soon)"
            disabled
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground disabled:opacity-40 transition-colors"
          >
            <Upload size={12} />
            Export
          </button>

          <button
            title="Import IDL (coming soon)"
            disabled
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground disabled:opacity-40 transition-colors"
          >
            <Download size={12} />
            Import
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            title="Save (Ctrl+S)"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
          >
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {isSaving ? "Saving..." : "Save"}
          </button>

          <button
            onClick={handleSync}
            title="Sync flow → source files"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <RefreshCw size={12} />
            Sync
          </button>

          <div className="mx-0.5 h-4 w-px bg-border" />

          {/* Wallet placeholder */}
          <button
            title="Wallet (not available in local mode)"
            disabled
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground disabled:opacity-40 transition-colors"
          >
            <Wallet size={12} />
            Connect
          </button>

          <div className="mx-0.5 h-4 w-px bg-border" />

          {/* Test */}
          <button
            onClick={runTest}
            disabled={testStatus === "running"}
            title="Run tests locally"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
          >
            {testIcon}
            {testStatus === "running" ? "Testing..." : "Test"}
          </button>

          {/* Deploy */}
          <button
            onClick={runDeploy}
            disabled={deployStatus === "running"}
            title="Deploy locally"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
          >
            {deployIcon}
            {deployStatus === "running" ? "Deploying..." : "Deploy"}
          </button>

          {/* Compile — primary button */}
          <button
            onClick={runCompile}
            disabled={compileStatus === "running"}
            title="Compile program locally"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {compileIcon}
            {compileStatus === "running" ? "Compiling..." : "Compile"}
          </button>
        </div>
      </header>

      {/* ─── Main area ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {paletteOpen && <NodePalette />}
        <div className="relative flex-1 overflow-hidden">
          {!paletteOpen && (
            <button
              onClick={togglePalette}
              className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-xs text-muted-foreground hover:bg-accent"
              title="Show node palette"
            >
              ›
            </button>
          )}
          {!propertiesOpen && (
            <button
              onClick={toggleProperties}
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-xs text-muted-foreground hover:bg-accent"
              title="Show properties panel"
            >
              ‹
            </button>
          )}
          <FlowCanvas />
        </div>
        {propertiesOpen && <PropertiesPanel />}
      </div>

      {/* ─── Bottom panel — matches web editor ──────────────────────── */}
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
          <div className="flex shrink-0 items-center gap-0 border-b border-border bg-card overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden">
            {(["code", "console", "tests", "audit"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setBottomPanelTab(tab)}
                className={`shrink-0 px-4 py-1.5 text-xs capitalize transition-colors ${
                  bottomPanelTab === tab
                    ? "border-b-2 border-primary bg-background text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground border-b-2 border-transparent"
                }`}
              >
                {tab}
              </button>
            ))}
            <div className="sticky right-0 ml-auto flex shrink-0 items-center bg-card pl-2 pr-1 shadow-[-8px_0_8px_-4px_rgba(0,0,0,0.3)]">
              <button
                onClick={toggleBottomPanel}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Close panel (Ctrl+B)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>
          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {bottomPanelTab === "code" && (
              <SourceCodePanel
                nodes={nodes}
                edges={edges}
                parseReport={parseReport}
                onParseReportUpdate={setParseReport}
                onFlowUpdate={(newNodes, newEdges) => {
                  isRemoteUpdate.current = true;
                  setFlow(newNodes, newEdges);
                }}
              />
            )}
            {bottomPanelTab === "console" && (
              <ConsolePanel output={consoleOutput} />
            )}
            {bottomPanelTab === "tests" && (
              <TestPanel output={testOutput} status={testStatus} />
            )}
            {bottomPanelTab === "audit" && (
              <StandaloneAuditPanel nodes={nodes} edges={edges} />
            )}
          </div>
        </div>
      )}

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

// ─── Console Panel ──────────────────────────────────────────────────────

function ConsolePanel({ output }: { output: string }) {
  if (!output) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Run Compile or Deploy to see output here.
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto bg-background p-3">
      <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">{output}</pre>
    </div>
  );
}

// ─── Test Panel ─────────────────────────────────────────────────────────

function TestPanel({ output, status }: { output: string; status: BuildStatus }) {
  if (!output) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Click Test to run tests locally.
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`text-xs font-semibold ${status === "success" ? "text-green-400" : status === "error" ? "text-red-400" : "text-yellow-400"}`}>
          {status === "success" ? "PASSED" : status === "error" ? "FAILED" : "RUNNING"}
        </span>
      </div>
      <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">{output}</pre>
    </div>
  );
}

// ─── Standalone Audit Panel ─────────────────────────────────────────────

function StandaloneAuditPanel({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const [report, setReport] = useState<AuditReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const runAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      if (!res.ok) throw new Error("Audit failed");
      const data = await res.json();
      setReport(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  }, [nodes, edges]);

  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Click below to run a security audit on your program.</p>
        <div className="flex gap-2">
          <button
            onClick={runAudit}
            disabled={loading}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Running..." : "Run Instant Audit"}
          </button>
        </div>
      </div>
    );
  }

  const findings = report.findings ?? [];
  const score = report.score ?? 100;
  const stressTests = report.stressTests ?? [];
  const stressTotal = report.stressSummary?.total ?? stressTests.length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-4 border-b border-border px-4 py-2">
        <span className={`text-sm font-semibold ${score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400"}`}>
          Score: {score}/100
        </span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {(report.summary?.critical ?? 0) > 0 && <span className="text-red-400">{report.summary.critical} critical</span>}
          {(report.summary?.high ?? 0) > 0 && <span className="text-orange-400">{report.summary.high} high</span>}
          {(report.summary?.medium ?? 0) > 0 && <span className="text-yellow-400">{report.summary.medium} medium</span>}
          {(report.summary?.low ?? 0) > 0 && <span className="text-blue-400">{report.summary.low} low</span>}
          {stressTotal > 0 && <span className="text-cyan-400">{stressTotal} stress</span>}
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="ml-auto rounded bg-primary/90 px-3 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary disabled:opacity-50"
        >
          {loading ? "Running..." : "Re-run"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {findings.length === 0 && stressTests.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
            <CheckCircle size={24} className="text-green-400" />
            <p className="font-medium text-green-400">No issues found</p>
            <p className="text-muted-foreground">Score: {score}/100</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {stressTests.length > 0 && (
              <div className="px-4 py-3">
                <div className="mb-2">
                  <div className="text-sm font-medium">Deterministic Stress</div>
                  <div className="text-[11px] text-muted-foreground">
                    {stressTests.length} generated edge-case probes
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {stressTests.slice(0, 12).map((test: AuditStressCaseData) => {
                    const colors = SEVERITY_COLORS[test.severity] ?? SEVERITY_COLORS.info;
                    return (
                      <div key={test.id} className="rounded border border-border bg-background/40 p-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${colors.badge}`}>
                            {colors.label}
                          </span>
                          <span className="truncate text-xs font-medium">{test.title}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          <span className="font-mono">{test.instructionName}</span>
                          <span>{test.category}</span>
                          <span>expected: {test.expected}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {test.rationale}
                        </p>
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
            {findings.length === 0 && (
              <div className="px-4 py-3 text-xs text-green-400">
                No static findings.
              </div>
            )}
            {findings.map((f: AuditFindingData, i: number) => {
              const colors = SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.info;
              return (
                <div key={`${f.ruleId}-${i}`} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${colors.badge}`}>
                          {colors.label}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">{f.ruleId}</span>
                        <span className="text-sm font-medium">{f.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                      <p className="mt-1 text-xs text-foreground/80">
                        <span className="font-medium">Fix: </span>{f.recommendation}
                      </p>
                      {f.location?.instructionName && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground/60 font-mono">
                          instruction: {f.location.instructionName}
                          {f.location.accountName && ` › ${f.location.accountName}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const SEVERITY_COLORS: Record<string, { dot: string; badge: string; label: string }> = {
  critical: { dot: "bg-red-500", badge: "bg-red-500/10 text-red-400 border-red-500/30", label: "CRITICAL" },
  high: { dot: "bg-orange-500", badge: "bg-orange-500/10 text-orange-400 border-orange-500/30", label: "HIGH" },
  medium: { dot: "bg-yellow-500", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", label: "MEDIUM" },
  low: { dot: "bg-blue-500", badge: "bg-blue-500/10 text-blue-400 border-blue-500/30", label: "LOW" },
  info: { dot: "bg-muted-foreground", badge: "bg-muted/30 text-muted-foreground border-border", label: "INFO" },
};

// ─── Source Code Panel (editable, shows actual project files) ────────────

function SourceCodePanel({
  nodes,
  edges,
  parseReport,
  onParseReportUpdate,
  onFlowUpdate,
}: {
  nodes: Node[];
  edges: Edge[];
  parseReport: ParseReport | null;
  onParseReportUpdate: (report: ParseReport | null) => void;
  onFlowUpdate: (nodes: Node[], edges: Edge[]) => void;
}) {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [originalContent, setOriginalContent] = useState<Record<string, string>>({});
  const editorRef = useRef<unknown>(null);

  // Load source files on mount and when flow updates (re-parse)
  const loadFiles = useCallback(async () => {
    try {
      const data = await fetchSourceFiles();
      setFiles(data.files);
      setOriginalContent((prev) => {
        const next: Record<string, string> = {};
        for (const f of data.files) next[f.path] = f.content;
        return next;
      });
      setActivePath((prev) => prev && data.files.some((f) => f.path === prev) ? prev : data.files[0]?.path ?? null);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);
  // Reload when flow updates from file watcher
  useEffect(() => {
    // Re-fetch source files when nodes change (from file watcher re-parse)
    // but skip the initial load
  }, [nodes, edges]);

  const currentFile = files.find((f) => f.path === activePath) ?? files[0] ?? null;
  const isDirty = currentFile ? dirty.has(currentFile.path) : false;

  const handleSave = useCallback(async () => {
    if (!currentFile || saving) return;
    // Get the latest content from Monaco editor
    const editor = editorRef.current as { getValue?: () => string } | null;
    const latestContent = editor?.getValue?.();
    if (!latestContent && latestContent !== "") return;

    setSaving(true);
    try {
      const result = await saveSourceFile(currentFile.path, latestContent);
      if (result.ok) {
        setDirty((prev) => { const next = new Set(prev); next.delete(currentFile.path); return next; });
        setOriginalContent((prev) => ({ ...prev, [currentFile.path]: latestContent }));
        // Update the files array with saved content
        setFiles((prev) => prev.map(f => f.path === currentFile.path ? { ...f, content: latestContent } : f));
        toast.success("Saved & re-parsed");
        onParseReportUpdate(result.report ?? null);
        // Update visual flow with new parsed data
        onFlowUpdate(result.nodes ?? [], result.edges ?? []);
      } else {
        toast.error("Save failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [currentFile, saving, onFlowUpdate, onParseReportUpdate]);

  // Ctrl+S shortcut for saving
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        // Only intercept if this panel is visible
        if (isDirty) {
          e.preventDefault();
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, isDirty]);

  const detectLanguage = (file: SourceFile): string => {
    if (file.language === "rust") return "rust";
    if (file.language === "toml") return "plaintext";
    if (file.path.endsWith(".rs")) return "rust";
    if (file.path.endsWith(".toml")) return "plaintext";
    return "plaintext";
  };

  const shortName = (path: string) => path.split("/").pop() ?? path;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading source files...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No source files found in the project.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* File tabs + save button */}
      <div className="flex shrink-0 items-center overflow-x-auto border-b border-border bg-card">
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {files.map((file) => {
            const isActive = file.path === (activePath ?? files[0]?.path);
            const isFileDirty = dirty.has(file.path);
            return (
              <button
                key={file.path}
                onClick={() => setActivePath(file.path)}
                title={file.path}
                className={`flex shrink-0 items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs transition-colors
                  hover:bg-accent hover:text-accent-foreground
                  ${isActive ? "border-b-2 border-b-primary bg-background text-foreground" : "text-muted-foreground"}`}
              >
                <FileIcon path={file.path} />
                {shortName(file.path)}
                {isFileDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
              </button>
            );
          })}
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          title={isDirty ? "Save & Re-parse (Ctrl+S)" : "No changes"}
          className={`shrink-0 border-l border-border px-3 py-1.5 text-[10px] font-medium transition-colors whitespace-nowrap
            ${isDirty ? "text-primary hover:bg-accent" : "text-muted-foreground/50"}`}
        >
          {saving ? "Saving..." : isDirty ? "Save & Parse" : "Saved"}
        </button>
      </div>

      {/* Path breadcrumb */}
      {currentFile && (
        <div className="shrink-0 border-b border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
          {currentFile.path}
          {isDirty && <span className="ml-2 text-amber-400">● modified</span>}
        </div>
      )}

      {parseReport && <ParseReportStrip report={parseReport} />}

      {/* Monaco editor */}
      <div className="min-h-0 flex-1">
        {currentFile ? (
          <MonacoEditor
            key={currentFile.path}
            defaultValue={currentFile.content}
            language={detectLanguage(currentFile)}
            theme="vs-dark"
            onMount={(editor: unknown) => { editorRef.current = editor; }}
            onChange={(value: string | undefined) => {
              if (!currentFile) return;
              const newContent = value ?? "";
              const isChanged = newContent !== (originalContent[currentFile.path] ?? "");
              setDirty((prev) => {
                const next = new Set(prev);
                if (isChanged) next.add(currentFile.path);
                else next.delete(currentFile.path);
                return next;
              });
            }}
            options={{
              readOnly: false,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineNumbers: "on",
              wordWrap: "off",
              automaticLayout: true,
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              renderLineHighlight: "none",
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              padding: { top: 8, bottom: 8 },
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No file selected.
          </div>
        )}
      </div>
    </div>
  );
}

function FileIcon({ path }: { path: string }) {
  if (path.endsWith(".rs")) return <span className="text-orange-400">🦀</span>;
  if (path.endsWith(".toml")) return <span className="text-blue-400">⚙</span>;
  return null;
}

function ParseReportStrip({ report }: { report: ParseReport }) {
  const confidenceClass = report.confidence === "high"
    ? "text-green-400"
    : report.confidence === "medium"
      ? "text-yellow-400"
      : "text-red-400";
  const skippedPreview = report.skippedFiles.slice(0, 2).map((file) => file.path).join(", ");

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{report.framework}</span>
      <span className={confidenceClass}>{report.confidence} confidence</span>
      <span>{report.filesParsed} parsed</span>
      <span>{report.filesSkipped} skipped</span>
      {report.unsupportedConstructs.length > 0 && (
        <span className="text-amber-400">{report.unsupportedConstructs.length} manual review</span>
      )}
      {skippedPreview && (
        <span className="max-w-[48ch] truncate font-mono text-muted-foreground/70" title={skippedPreview}>
          skipped: {skippedPreview}
        </span>
      )}
    </div>
  );
}

// ─── Placeholders ──────────────────────────────────────────────────────

function CanvasPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="text-sm">Loading canvas...</p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Workflow size={16} className="text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold text-foreground">SolStudio</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading project...</p>
        </div>
      </div>
    </div>
  );
}

function PanelPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
      {text}
    </div>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────

type BuildStatus2 = "idle" | "running" | "success" | "error";

interface AuditFindingData {
  ruleId: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  location: { instructionName?: string; accountName?: string; nodeId?: string };
}

interface AuditStressCaseData {
  id: string;
  title: string;
  category: string;
  instructionName: string;
  severity: string;
  expected: string;
  rationale: string;
}

interface AuditReportData {
  findings: AuditFindingData[];
  score: number;
  summary: { critical: number; high: number; medium: number; low: number; info: number };
  stressTests?: AuditStressCaseData[];
  stressSummary?: { total: number };
}

declare global {
  interface Window {
    __SOLSTUDIO_STANDALONE__?: boolean;
  }
}
