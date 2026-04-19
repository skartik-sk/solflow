// EditorTopBar — the horizontal bar across the top of the editor.
// Shows: logo, project name, framework toggle, network selector, save status, actions.
// Phase 3: Compile/Test/Deploy buttons wired to useBuildStore.

"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Workflow,
  ChevronLeft,
  Save,
  Loader2,
  RotateCcw,
  RotateCw,
  Download,
  Upload,
  History,
  Play,
  Hammer,
  Rocket,
  CheckCircle,
  XCircle,
  Wallet,
  Keyboard,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useProjectStore } from "@/store/project-store";
import { useUIStore } from "@/store/ui-store";
import { useUndo, useRedo, useCanUndo, useCanRedo, useFlowStore } from "@/store/flow-store";
import { useBuildStore } from "@/store/build-store";
import type { Framework, Network } from "@/store/project-store";
import { ImportDialog } from "./ImportDialog";

export function EditorTopBar() {
  const projectId = useProjectStore((s) => s.projectId);
  const projectName = useProjectStore((s) => s.projectName);
  const framework = useProjectStore((s) => s.framework);
  const network = useProjectStore((s) => s.network);
  const isDirty = useProjectStore((s) => s.isDirty);
  const isSaving = useProjectStore((s) => s.isSaving);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setFramework = useProjectStore((s) => s.setFramework);
  const setNetwork = useProjectStore((s) => s.setNetwork);
  const save = useProjectStore((s) => s.save);

  const openBottomPanelTab = useUIStore((s) => s.openBottomPanelTab);
  const propertiesOpen = useUIStore((s) => s.propertiesOpen);
  const toggleProperties = useUIStore((s) => s.toggleProperties);

  const wallet = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const compileStatus = useBuildStore((s) => s.compileStatus);
  const testStatus = useBuildStore((s) => s.testStatus);
  const deployStatus = useBuildStore((s) => s.deployStatus);
  const deployedProgramId = useBuildStore((s) => s.deployedProgramId);
  const deployExplorerUrl = useBuildStore((s) => s.deployExplorerUrl);
  const deployTxExplorerUrl = useBuildStore((s) => s.deployTxExplorerUrl);
  const startCompile = useBuildStore((s) => s.startCompile);
  const startTest = useBuildStore((s) => s.startTest);
  const startDeploy = useBuildStore((s) => s.startDeploy);
  const resetProgramKeypair = useBuildStore((s) => s.resetProgramKeypair);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const [isExporting, setIsExporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [, startSave] = useTransition();

  const commitName = () => {
    setEditingName(false);
    if (nameInput.trim() && nameInput !== projectName) {
      setProjectName(nameInput.trim());
    } else {
      setNameInput(projectName);
    }
  };

  const handleSave = () => {
    startSave(async () => {
      try {
        await save({ snapshot: true });
        toast.success("Saved");
      } catch {
        toast.error("Failed to save");
      }
    });
  };

  const handleExport = async () => {
    if (!projectId) {
      toast.error("No project to export");
      return;
    }
    setIsExporting(true);
    try {
      const res = await fetch(
        `/api/download/${projectId}?include=program,irJson`,
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ??
        "solflow-export.zip";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCompile = async () => {
    if (!projectId) {
      toast.error("No project");
      return;
    }
    openBottomPanelTab("console");
    try {
      await startCompile(projectId);
      if (useBuildStore.getState().compileStatus === "success") {
        toast.success("Compilation succeeded");
      } else {
        toast.error("Compilation failed — see Errors tab");
        openBottomPanelTab("errors");
      }
    } catch {
      toast.error("Compilation error");
    }
  };

  const handleTest = async () => {
    if (!projectId) {
      toast.error("No project");
      return;
    }
    openBottomPanelTab("tests");
    try {
      await startTest(projectId);
    } catch {
      toast.error("Tests failed");
    }
  };

  const handleDeploy = async () => {
    if (!projectId) {
      toast.error("No project");
      return;
    }
    openBottomPanelTab("console");
    const net = network.toUpperCase() as "DEVNET" | "MAINNET" | "LOCALNET";
    try {
      await startDeploy(projectId, net, wallet as any);
      if (useBuildStore.getState().deployStatus === "success") {
        toast.success("Deployed!");
      }
    } catch {
      toast.error("Deployment failed");
    }
  };

  const handleResetProgram = async () => {
    if (!projectId) return;
    const confirmed = window.confirm(
      "Reset program keypair?\n\nThis will generate a new program ID. " +
        "The next deploy will create a fresh program (with upgrade headroom). " +
        "The old program will remain on-chain but won't be upgraded.\n\n" +
        "This is useful when the program was deployed without upgrade headroom.",
    );
    if (!confirmed) return;
    try {
      openBottomPanelTab("console");
      const newId = await resetProgramKeypair(projectId);
      toast.success(`Program keypair reset: ${newId.slice(0, 8)}…`);
    } catch {
      toast.error("Failed to reset program keypair");
    }
  };

  // ─── Compile button appearance ────────────────────────────────────────────

  const handleSettings = () => {
    // Find the program node and select it, then open properties panel
    const nodes = useFlowStore.getState().nodes;
    const programNode = nodes.find((n) => n.type === "program");
    if (programNode) {
      useFlowStore.getState().setSelectedNode(programNode.id);
    }
    if (!propertiesOpen) toggleProperties();
  };
  const isCompiling =
    compileStatus === "queued" || compileStatus === "building";
  const compileIcon = isCompiling ? (
    <Loader2 size={12} className="animate-spin" />
  ) : compileStatus === "success" ? (
    <CheckCircle size={12} className="text-green-400" />
  ) : compileStatus === "error" ? (
    <XCircle size={12} className="text-red-400" />
  ) : (
    <Hammer size={12} />
  );

  const isTesting = testStatus === "running";
  const testIcon = isTesting ? (
    <Loader2 size={12} className="animate-spin" />
  ) : testStatus === "passed" ? (
    <CheckCircle size={12} className="text-green-400" />
  ) : testStatus === "failed" ? (
    <XCircle size={12} className="text-red-400" />
  ) : (
    <Play size={12} />
  );

  const isDeploying =
    deployStatus === "deploying" || deployStatus === "confirming";
  const deployIcon = isDeploying ? (
    <Loader2 size={12} className="animate-spin" />
  ) : deployStatus === "success" ? (
    <CheckCircle size={12} className="text-green-400" />
  ) : deployStatus === "error" ? (
    <XCircle size={12} className="text-red-400" />
  ) : (
    <Rocket size={12} />
  );

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-3">
      {/* ─── Left ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Back to dashboard"
        >
          <ChevronLeft size={15} />
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
            <Workflow size={13} className="text-primary-foreground" />
          </div>
        </Link>

        <span className="text-muted-foreground">/</span>

        {/* Editable project name */}
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setNameInput(projectName);
                setEditingName(false);
              }
            }}
            className="h-7 rounded border border-primary bg-background px-2 text-sm font-medium outline-none focus:ring-1 focus:ring-primary"
            style={{ width: `${Math.max(nameInput.length + 2, 10)}ch` }}
          />
        ) : (
          <button
            onClick={() => {
              setNameInput(projectName);
              setEditingName(true);
            }}
            className="rounded px-1.5 py-0.5 text-sm font-medium hover:bg-accent transition-colors"
            title="Click to rename"
          >
            {projectName}
          </button>
        )}

        {/* Project settings */}
        <button
          onClick={handleSettings}
          title="Project settings"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Settings size={12} />
        </button>

        {/* Dirty indicator */}
        {isDirty && !isSaving && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-amber-400"
            title="Unsaved changes"
          />
        )}

        {/* Deployed program ID chip */}
        {deployedProgramId && deployStatus === "success" && (
          <span className="ml-1 flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] text-green-400">
            <CheckCircle size={9} />
            {deployExplorerUrl ? (
              <a
                href={deployExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {deployedProgramId.slice(0, 8)}…
              </a>
            ) : (
              <span>{deployedProgramId.slice(0, 8)}…</span>
            )}
          </span>
        )}
      </div>

      {/* ─── Center ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Undo / Redo */}
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

        {/* Framework toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["anchor", "pinocchio", "quasar"] as Framework[]).map((fw) => (
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
          onChange={(e) => setNetwork(e.target.value as Network)}
          className="h-7 rounded-lg border border-border bg-card px-2 text-xs text-muted-foreground outline-none hover:border-border/80 focus:border-primary"
        >
          <option value="devnet">Devnet</option>
          <option value="mainnet">Mainnet</option>
          <option value="localnet">Localnet</option>
        </select>
      </div>

      {/* ─── Right ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Version history */}
        <button
          onClick={() => openBottomPanelTab("history")}
          title="Version history"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <History size={13} />
        </button>

        {/* Export zip */}
        <button
          onClick={handleExport}
          disabled={isExporting || !projectId}
          title="Export as .zip"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
        >
          {isExporting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Upload size={12} />
          )}
          Export
        </button>

        {/* Import IDL */}
        <button
          onClick={() => setShowImport(true)}
          title="Import IDL"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
        >
          <Download size={12} />
          Import
        </button>

        {showImport && (
          <ImportDialog onClose={() => setShowImport(false)} />
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          title="Save (Ctrl+S)"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
        >
          {isSaving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}
          {isSaving ? "Saving…" : "Save"}
        </button>

        <div className="mx-0.5 h-4 w-px bg-border" />

        {/* Wallet connect */}
        <button
          onClick={() => {
            if (wallet.connected) {
              wallet.disconnect();
            } else {
              setWalletModalVisible(true);
            }
          }}
          title={
            wallet.connected && wallet.publicKey
              ? `Connected: ${wallet.publicKey.toBase58()} — click to disconnect`
              : "Connect wallet to deploy"
          }
          className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
            wallet.connected
              ? "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
              : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Wallet size={12} />
          {wallet.connected && wallet.publicKey
            ? `${wallet.publicKey.toBase58().slice(0, 4)}..${wallet.publicKey.toBase58().slice(-4)}`
            : "Connect"}
        </button>

        <div className="mx-0.5 h-4 w-px bg-border" />

        {/* Test */}
        <button
          onClick={handleTest}
          disabled={isTesting || !projectId}
          title="Run tests"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
        >
          {testIcon}
          {isTesting ? "Testing…" : "Test"}
        </button>

        {/* Deploy */}
        <button
          onClick={handleDeploy}
          disabled={isDeploying || !projectId || compileStatus !== "success"}
          title={
            compileStatus !== "success"
              ? "Compile first before deploying"
              : "Deploy to network"
          }
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
        >
          {deployIcon}
          {isDeploying ? "Deploying…" : "Deploy"}
        </button>

        {/* Reset Program Keypair */}
        <button
          onClick={handleResetProgram}
          disabled={!projectId || isDeploying}
          title="Reset program keypair (generates new program ID for fresh deploy with upgrade headroom)"
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
        >
          <RotateCcw size={12} />
        </button>

        {/* Keyboard shortcuts */}
        <div className="relative group">
          <button
            title="Keyboard shortcuts"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Keyboard size={12} />
          </button>
          <div className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-56 rounded-lg border border-border bg-card p-3 shadow-xl group-hover:block">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Shortcuts
            </p>
            <div className="space-y-1 text-[11px]">
              <ShortcutRow keys="Ctrl+S" label="Save" />
              <ShortcutRow keys="Ctrl+Z" label="Undo" />
              <ShortcutRow keys="Ctrl+Shift+Z" label="Redo" />
              <ShortcutRow keys="Ctrl+F" label="Find node" />
              <ShortcutRow keys="Del / Bksp" label="Delete selected" />
              <ShortcutRow keys="Shift" label="Multi-select" />
            </div>
          </div>
        </div>

        {/* Compile */}
        <button
          onClick={handleCompile}
          disabled={isCompiling || !projectId}
          title="Compile program"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          {compileIcon}
          {isCompiling ? "Compiling…" : "Compile"}
        </button>
      </div>
    </header>
  );
}

// ─── Shortcut row helper ──────────────────────────────────────────────────────

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
        {keys}
      </kbd>
    </div>
  );
}
