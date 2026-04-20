"use client";

// Settings Dialog — modal overlay for user preferences.

import React, { useState } from "react";
import { X, RotateCcw, RefreshCw, Keyboard, Workflow } from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/store/settings-store";
import { useUIStore, type Theme } from "@/store/ui-store";
import { useProjectStore } from "@/store/project-store";
import { useBuildStore } from "@/store/build-store";
import { useFlowStore } from "@/store/flow-store";
import { getRFInstance } from "@/lib/rf-instance";

type SettingsTab = "editor" | "defaults" | "build" | "shortcuts";

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>("editor");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative flex w-[520px] max-h-[80vh] flex-col rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 border-b border-border px-5">
          {(["editor", "defaults", "build", "shortcuts"] as SettingsTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "editor" ? "Editor" : t === "defaults" ? "Defaults" : t === "build" ? "Build" : "Shortcuts"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "editor" && <EditorTab />}
          {tab === "defaults" && <DefaultsTab />}
          {tab === "build" && <BuildTab />}
          {tab === "shortcuts" && <ShortcutsTab />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <ResetButton />
          <button
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function Row({ label, children, description }: { label: string; children: React.ReactNode; description?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        value ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

const selectClass =
  "rounded-md border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary";

// ─── Editor Tab ──────────────────────────────────────────────────────────────

function EditorTab() {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const showLineNumbers = useSettingsStore((s) => s.showLineNumbers);
  const setShowLineNumbers = useSettingsStore((s) => s.setShowLineNumbers);
  const minimapEnabled = useSettingsStore((s) => s.minimapEnabled);
  const setMinimapEnabled = useSettingsStore((s) => s.setMinimapEnabled);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const setWordWrap = useSettingsStore((s) => s.setWordWrap);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="divide-y divide-border/30">
      <Row label="Font Size" description="Editor text size (10–24)">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={10}
            max={24}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-24 accent-primary"
          />
          <span className="w-6 text-right text-xs text-muted-foreground font-mono">{fontSize}</span>
        </div>
      </Row>
      <Row label="Theme">
        <select
          className={selectClass}
          value={theme}
          onChange={(e) => setTheme(e.target.value as Theme)}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </Row>
      <Row label="Line Numbers" description="Show line numbers in the editor">
        <Toggle value={showLineNumbers} onChange={setShowLineNumbers} />
      </Row>
      <Row label="Minimap" description="Show code minimap on the right side">
        <Toggle value={minimapEnabled} onChange={setMinimapEnabled} />
      </Row>
      <Row label="Word Wrap" description="Wrap long lines instead of scrolling">
        <Toggle value={wordWrap} onChange={setWordWrap} />
      </Row>
    </div>
  );
}

// ─── Defaults Tab ────────────────────────────────────────────────────────────

function DefaultsTab() {
  const defaultFramework = useSettingsStore((s) => s.defaultFramework);
  const setDefaultFramework = useSettingsStore((s) => s.setDefaultFramework);
  const defaultNetwork = useSettingsStore((s) => s.defaultNetwork);
  const setDefaultNetwork = useSettingsStore((s) => s.setDefaultNetwork);
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveIntervalSec);
  const setAutoSaveInterval = useSettingsStore((s) => s.setAutoSaveIntervalSec);

  return (
    <div className="divide-y divide-border/30">
      <Row label="Default Framework" description="Framework used when generating code">
        <select
          className={selectClass}
          value={defaultFramework}
          onChange={(e) => setDefaultFramework(e.target.value as "anchor" | "pinocchio")}
        >
          <option value="anchor">Anchor</option>
          <option value="pinocchio">Pinocchio</option>
        </select>
      </Row>
      <Row label="Default Network" description="Network for RPC calls and deployments">
        <select
          className={selectClass}
          value={defaultNetwork}
          onChange={(e) => setDefaultNetwork(e.target.value as "devnet" | "mainnet" | "localnet")}
        >
          <option value="devnet">Devnet</option>
          <option value="mainnet">Mainnet</option>
          <option value="localnet">Localnet</option>
        </select>
      </Row>
      <Row label="Auto-save Interval" description="Seconds between auto-saves (0 = disabled)">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={120}
            step={5}
            value={autoSaveInterval}
            onChange={(e) => setAutoSaveInterval(Number(e.target.value))}
            className="w-24 accent-primary"
          />
          <span className="w-12 text-right text-xs text-muted-foreground font-mono">
            {autoSaveInterval === 0 ? "Off" : `${autoSaveInterval}s`}
          </span>
        </div>
      </Row>
    </div>
  );
}

// ─── Build Tab ───────────────────────────────────────────────────────────────

function BuildTab() {
  const autoBuild = useSettingsStore((s) => s.autoBuildOnCodeChange);
  const setAutoBuild = useSettingsStore((s) => s.setAutoBuildOnCodeChange);
  const showNotifications = useSettingsStore((s) => s.showBuildNotifications);
  const setShowNotifications = useSettingsStore((s) => s.setShowBuildNotifications);
  const projectId = useProjectStore((s) => s.projectId);
  const resetProgramKeypair = useBuildStore((s) => s.resetProgramKeypair);
  const isDeploying = useBuildStore((s) => s.deployStatus) === "deploying" ||
    useBuildStore((s) => s.deployStatus) === "confirming";

  const handleResetProgram = async () => {
    if (!projectId) return;
    const confirmed = window.confirm(
      "Reset program keypair?\n\nThis will generate a new program ID. " +
        "The next deploy will create a fresh program (with upgrade headroom). " +
        "The old program will remain on-chain but won't be upgraded.\n\n" +
        "This is useful when the program was deployed without upgrade headroom."
    );
    if (!confirmed) return;
    try {
      const newId = await resetProgramKeypair(projectId);
      toast.success(`Program keypair reset: ${newId.slice(0, 8)}…`);
    } catch {
      toast.error("Failed to reset program keypair");
    }
  };

  return (
    <div className="divide-y divide-border/30">
      <Row label="Auto-build on Code Change" description="Automatically build when code is modified">
        <Toggle value={autoBuild} onChange={setAutoBuild} />
      </Row>
      <Row label="Build Notifications" description="Show toast notifications for build status">
        <Toggle value={showNotifications} onChange={setShowNotifications} />
      </Row>
      <Row label="Reset Program Keypair" description="Generate a new program ID for fresh deploy with upgrade headroom">
        <button
          onClick={handleResetProgram}
          disabled={!projectId || isDeploying}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={11} />
          Reset
        </button>
      </Row>
      <Row label="Reset All Node Positions" description="Compact all nodes into a tight grid layout">
        <button
          onClick={() => {
            const nodeIds = useFlowStore.getState().nodes.map((n) => n.id);
            useFlowStore.getState().compactSelectedNodes(nodeIds);
            setTimeout(() => getRFInstance()?.fitView({ duration: 400, padding: 0.2 }), 50);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Workflow size={11} />
          Reset
        </button>
      </Row>
    </div>
  );
}

// ─── Shortcuts Tab ──────────────────────────────────────────────────────────────

function ShortcutsTab() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Keyboard size={14} />
        <p className="text-xs font-medium">Keyboard Shortcuts</p>
      </div>
      <div className="space-y-1.5">
        <ShortcutRow keys="Ctrl+S" label="Save" />
        <ShortcutRow keys="Ctrl+Z" label="Undo" />
        <ShortcutRow keys="Ctrl+Shift+Z" label="Redo" />
        <ShortcutRow keys="Ctrl+F" label="Find node" />
        <ShortcutRow keys="Del / Bksp" label="Delete selected" />
        <ShortcutRow keys="Drag canvas" label="Box select" />
        <ShortcutRow keys="Shift+Click" label="Multi-select" />
        <ShortcutRow keys="Ctrl+A" label="Select all nodes" />
        <ShortcutRow keys="Space+Drag" label="Pan canvas" />
      </div>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
        {keys}
      </kbd>
    </div>
  );
}

// ─── Reset Button ────────────────────────────────────────────────────────────

function ResetButton() {
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  return (
    <button
      onClick={resetToDefaults}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <RotateCcw size={12} />
      Reset to defaults
    </button>
  );
}
