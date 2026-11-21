// EditorTopBar — the horizontal bar across the top of the editor.
// Shows: logo, project name, framework toggle, network selector, save status, actions.
// Phase 3: Compile/Test/Deploy buttons wired to useBuildStore.

"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
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
  Settings,
  Globe,
  Share2,
  X,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useProjectStore } from "@/store/project-store";
import { useUIStore } from "@/store/ui-store";
import { useUndo, useRedo, useCanUndo, useCanRedo } from "@/store/flow-store";
import { useBuildStore } from "@/store/build-store";
import type { Framework, Network } from "@/store/project-store";
import { ImportDialog } from "./ImportDialog";
import { SettingsDialog } from "./SettingsDialog";
import { openFloatingBrowser } from "@/store/floating-browser-store";
import {
  EditorMark,
  EdDivider,
  edBtn,
  edGhostBtn,
  edIconBtn,
  edPrimaryBtn,
  edx,
} from "@/components/ui-kit/editor-ui";

export function EditorTopBar() {
  const projectId = useProjectStore((s) => s.projectId);
  const projectName = useProjectStore((s) => s.projectName);
  const framework = useProjectStore((s) => s.framework);
  const network = useProjectStore((s) => s.network);
  const customEndpoints = useProjectStore((s) => s.customEndpoints);
  const addCustomEndpoint = useProjectStore((s) => s.addCustomEndpoint);
  const removeCustomEndpoint = useProjectStore((s) => s.removeCustomEndpoint);
  const isDirty = useProjectStore((s) => s.isDirty);
  const isSaving = useProjectStore((s) => s.isSaving);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setFramework = useProjectStore((s) => s.setFramework);
  const setNetwork = useProjectStore((s) => s.setNetwork);
  const save = useProjectStore((s) => s.save);

  const openBottomPanelTab = useUIStore((s) => s.openBottomPanelTab);
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
  const startCompile = useBuildStore((s) => s.startCompile);
  const startTest = useBuildStore((s) => s.startTest);
  const startDeploy = useBuildStore((s) => s.startDeploy);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
        `/api/download/${projectId}?include=program,sdk,idl,tests,irJson`,
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

  const handleShare = async () => {
    if (!projectId) {
      toast.error("No project to share");
      return;
    }
    setIsSharing(true);
    try {
      if (isDirty) await save();
      const { getVanillaClient } = await import("@/lib/trpc/client");
      const client = getVanillaClient();
      const result = await client.share.create.mutate({ projectId });
      await navigator.clipboard.writeText(result.url);
      toast.success("Read-only share link copied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Share failed");
    } finally {
      setIsSharing(false);
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

  // ─── Compile button appearance ────────────────────────────────────────────

  const handleSettings = () => {
    setShowSettings(true);
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

  const compileDone = compileStatus === "success";

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-border bg-card px-2.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.02)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* ─── Left ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 shrink-0 items-center gap-1">
        <Link
          href="/dashboard"
          className="group flex h-7 items-center gap-0.5 rounded-md pl-0.5 pr-1 text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          title="Back to dashboard"
          aria-label="Back to dashboard"
        >
          <ChevronLeft size={14} className="transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
          <EditorMark size={22} />
        </Link>

        <span className="px-0.5 text-[13px] text-white/15" aria-hidden>/</span>

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
            aria-label="Project name"
            className="h-7 rounded-md border border-primary/70 bg-background px-2 text-[13px] font-medium outline-none ring-2 ring-primary/20"
            style={{ width: `${Math.max(nameInput.length + 2, 10)}ch` }}
          />
        ) : (
          <button
            onClick={() => {
              setNameInput(projectName);
              setEditingName(true);
            }}
            className="h-7 max-w-[180px] truncate rounded-md px-1.5 text-[13px] font-semibold tracking-[-0.01em] text-foreground outline-none transition-colors duration-150 ease-out hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            title={projectName}
          >
            {projectName}
          </button>
        )}

        {/* Project settings */}
        <button
          onClick={handleSettings}
          title="Project settings"
          aria-label="Project settings"
          className={edIconBtn}
        >
          <Settings size={13} />
        </button>

        {/* Dirty indicator */}
        {isDirty && !isSaving && (
          <span
            className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-400"
            title="Unsaved changes"
          />
        )}

        {/* Deployed program ID chip */}
        {deployedProgramId && deployStatus === "success" && (
          <span className="ml-1.5 inline-flex h-6 items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 font-mono text-[11px] text-green-400">
            <CheckCircle size={10} />
            {deployExplorerUrl ? (
              <button
                onClick={() => openFloatingBrowser(deployExplorerUrl, `Program: ${deployedProgramId.slice(0, 6)}…`)}
                className="cursor-pointer rounded-sm outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {deployedProgramId.slice(0, 6)}…
              </button>
            ) : (
              <span>{deployedProgramId.slice(0, 6)}…</span>
            )}
          </span>
        )}
      </div>

      {/* ─── Center ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Undo / Redo */}
        <button
          onClick={() => undo()}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          className={edIconBtn}
        >
          <RotateCcw size={13} />
        </button>
        <button
          onClick={() => redo()}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          className={edIconBtn}
        >
          <RotateCw size={13} />
        </button>

        <EdDivider />

        {/* Framework toggle */}
        <div
          role="group"
          aria-label="Framework"
          className="flex h-7 items-center gap-0.5 rounded-lg bg-white/[0.035] p-0.5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
        >
          {(["anchor", "pinocchio", "quasar"] as Framework[]).map((fw) => (
            <button
              key={fw}
              onClick={() => setFramework(fw)}
              aria-pressed={framework === fw}
              className={`h-6 rounded-md px-2.5 text-[12px] font-medium capitalize outline-none transition-[color,background-color,box-shadow] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                framework === fw
                  ? "bg-[#23262c] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {fw}
            </button>
          ))}
        </div>

        {/* Network selector */}
        <div className="ml-1 flex items-center gap-1">
          <div className="relative">
            <span
              aria-hidden
              className={`pointer-events-none absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${
                network === "mainnet" ? "bg-amber-400" : network === "localnet" ? "bg-muted-foreground" : "bg-primary"
              }`}
            />
            <select
              value={network}
              aria-label="Network"
              onChange={(e) => {
                const val = e.target.value;
                if (val === "__add_custom__") {
                  const name = prompt("Endpoint name (e.g. My Devnet):");
                  if (!name?.trim()) return;
                  const url = prompt("RPC URL (e.g. https://my-rpc.example.com):");
                  if (!url?.trim()) return;
                  const id = `custom-${Date.now()}`;
                  addCustomEndpoint({ id, name: name.trim(), url: url.trim() });
                  setNetwork(id);
                  return;
                }
                setNetwork(val as Network);
              }}
              className="h-7 cursor-pointer appearance-none rounded-md bg-white/[0.03] pl-5 pr-6 text-[12px] font-medium text-foreground/85 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none transition-colors duration-150 ease-out hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            >
              <option value="devnet">Devnet</option>
              <option value="mainnet">Mainnet</option>
              <option value="localnet">Localnet</option>
              {customEndpoints.length > 0 && (
                <optgroup label="Custom">
                  {customEndpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>{ep.name}</option>
                  ))}
                </optgroup>
              )}
              <option disabled value="__add_custom__">+ Custom</option>
            </select>
            <ChevronDown
              size={12}
              aria-hidden
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
          {customEndpoints.find((e) => e.id === network) && (
            <button
              onClick={() => {
                removeCustomEndpoint(network);
                setNetwork("devnet");
              }}
              title="Remove this custom endpoint"
              aria-label="Remove this custom endpoint"
              className={edx(edIconBtn, "text-red-400 hover:bg-red-500/10 hover:text-red-300")}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ─── Right ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Version history */}
        <button
          onClick={() => openBottomPanelTab("history")}
          title="Version history"
          aria-label="Version history"
          className={edIconBtn}
        >
          <History size={13} />
        </button>

        {/* Floating browser */}
        <button
          onClick={() => openFloatingBrowser("/docs", "SolStudio Docs")}
          title="Open browser (docs, explorer, references)"
          aria-label="Open browser"
          className={edIconBtn}
        >
          <Globe size={13} />
        </button>

        {/* Export zip */}
        <button
          onClick={handleExport}
          disabled={isExporting || !projectId}
          title="Export program, SDK, IDLs, tests, and IR as .zip"
          className={edGhostBtn}
        >
          {isExporting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Upload size={12} />
          )}
          <span className="hidden lg:inline">Export</span>
        </button>

        {/* Public read-only share */}
        <button
          onClick={handleShare}
          disabled={isSharing || !projectId}
          title="Create read-only public share link"
          className={edGhostBtn}
        >
          {isSharing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Share2 size={12} />
          )}
          <span className="hidden lg:inline">Share</span>
        </button>

        {/* Import IDL */}
        <button
          onClick={() => setShowImport(true)}
          title="Import IDL"
          className={edGhostBtn}
        >
          <Download size={12} />
          <span className="hidden lg:inline">Import</span>
        </button>

        {showImport && (
          <ImportDialog onClose={() => setShowImport(false)} />
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          title="Save (Ctrl+S)"
          className={edGhostBtn}
        >
          {isSaving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}
          <span className="hidden lg:inline">{isSaving ? "Saving…" : "Save"}</span>
        </button>

        <EdDivider />

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
          className={
            wallet.connected
              ? edx(edBtn, "font-mono text-green-400 shadow-[0_0_0_1px_rgba(74,222,128,0.25)] hover:text-green-300")
              : edBtn
          }
        >
          <Wallet size={12} />
          {wallet.connected && wallet.publicKey
            ? `${wallet.publicKey.toBase58().slice(0, 3)}..${wallet.publicKey.toBase58().slice(-3)}`
            : "Connect"}
        </button>

        {/* Test */}
        <button
          onClick={handleTest}
          disabled={isTesting || !projectId}
          title="Run tests"
          className={edBtn}
        >
          {testIcon}
          {isTesting ? "Testing…" : "Test"}
        </button>

        {/* Compile: the primary action until the program has compiled */}
        <button
          onClick={handleCompile}
          disabled={isCompiling || !projectId}
          title="Compile program"
          className={compileDone ? edBtn : edPrimaryBtn}
        >
          {compileIcon}
          {isCompiling ? "Compiling…" : "Compile"}
        </button>

        {/* Deploy: becomes the primary action once compiled */}
        <button
          onClick={handleDeploy}
          disabled={isDeploying || !projectId || compileStatus !== "success"}
          title={
            compileStatus !== "success"
              ? "Compile first before deploying"
              : "Deploy to network"
          }
          className={compileDone ? edPrimaryBtn : edBtn}
        >
          {deployIcon}
          {isDeploying ? "Deploying…" : "Deploy"}
        </button>
      </div>

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
    </header>
  );
}
