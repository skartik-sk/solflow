// apps/web/src/components/editor/TestResultsPanel.tsx
// Bottom panel "tests" tab — interactive test case forms derived from IR +
// shows results from useBuildStore.

"use client";

import React, { useState, useCallback } from "react";
import { Copy } from "lucide-react";
import { useBuildStore } from "@/store/build-store";
import { toast } from "sonner";
import { useCodeStore } from "@/store/code-store";
import { useProjectStore } from "@/store/project-store";
import type { Instruction, Account, InstructionArg } from "@solflow/ir";
import type { GeneratedTestRuntime } from "@/store/build-store";

// ─── helpers ──────────────────────────────────────────────────────────────────

function typeLabel(type: unknown): string {
  if (typeof type === "string") return type;
  if (type && typeof type === "object") {
    const t = type as Record<string, unknown>;
    if ("array" in t)
      return `[${typeLabel((t.array as unknown[])[0])}; ${(t.array as unknown[])[1]}]`;
    if ("vec" in t) return `Vec<${typeLabel(t.vec)}>`;
    if ("option" in t) return `Option<${typeLabel(t.option)}>`;
    if ("defined" in t) return String(t.defined);
    if ("hashMap" in t) return `HashMap`;
    if ("enum" in t) return `enum`;
  }
  return "unknown";
}

function defaultValueForType(type: unknown): string {
  if (typeof type !== "string") return "";
  switch (type) {
    case "bool":
      return "true";
    case "u8":
    case "u16":
    case "u32":
    case "u64":
    case "u128":
    case "i8":
    case "i16":
    case "i32":
    case "i64":
    case "i128":
      return "0";
    case "f32":
    case "f64":
      return "0.0";
    case "String":
      return "";
    case "Pubkey":
      return "";
    default:
      return "";
  }
}

// ─── Per-instruction test card state ─────────────────────────────────────────

interface TestCardState {
  accounts: Record<string, string>;
  args: Record<string, string>;
  expectedResult: "success" | "error";
  errorCode: string;
}

function makeDefaultCard(ix: Instruction): TestCardState {
  return {
    accounts: Object.fromEntries(ix.accounts.map((a: Account) => [a.name, ""])),
    args: Object.fromEntries(
      (ix.args ?? []).map((arg: InstructionArg) => [
        arg.name,
        defaultValueForType(arg.type),
      ]),
    ),
    expectedResult: "success",
    errorCode: "",
  };
}

// ─── TestResultsPanel ─────────────────────────────────────────────────────────

export function TestResultsPanel() {
  const testStatus = useBuildStore((s) => s.testStatus);
  const testResults = useBuildStore((s) => s.testResults);
  const testSummary = useBuildStore((s) => s.testSummary);
  const testRunner = useBuildStore((s) => s.testRunner);
  const testRuntime = useBuildStore((s) => s.testRuntime);
  const testCommand = useBuildStore((s) => s.testCommand);
  const testSetupCommand = useBuildStore((s) => s.testSetupCommand);
  const testDuration = useBuildStore((s) => s.testDuration);
  const startTest = useBuildStore((s) => s.startTest);

  const irJson = useCodeStore((s) => s.irJson);
  const projectId = useProjectStore((s) => s.projectId);

  // View: "form" = test builder, "results" = results list
  const [view, setView] = useState<"form" | "results">(
    testResults.length > 0 ? "results" : "form",
  );
  const [runtime, setRuntime] = useState<GeneratedTestRuntime>("cargo-smoke");

  // Card state per instruction
  const [cards, setCards] = useState<Record<string, TestCardState>>(() => {
    if (!irJson?.instructions) return {};
    return Object.fromEntries(
      (irJson.instructions as Instruction[]).map((ix) => [
        ix.name,
        makeDefaultCard(ix),
      ]),
    );
  });

  // Expand/collapse per card
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (!irJson?.instructions) return {};
    const first = (irJson.instructions as Instruction[])[0]?.name;
    return first ? { [first]: true } : {};
  });

  const instructions: Instruction[] = irJson?.instructions ?? [];

  // ─── patch card field ────────────────────────────────────────────
  const setAccountVal = useCallback(
    (ixName: string, accName: string, val: string) => {
      setCards((prev) => ({
        ...prev,
        [ixName]: {
          ...prev[ixName],
          accounts: { ...prev[ixName]?.accounts, [accName]: val },
        },
      }));
    },
    [],
  );

  const setArgVal = useCallback(
    (ixName: string, argName: string, val: string) => {
      setCards((prev) => ({
        ...prev,
        [ixName]: {
          ...prev[ixName],
          args: { ...prev[ixName]?.args, [argName]: val },
        },
      }));
    },
    [],
  );

  // ─── run a single instruction's test ────────────────────────────
  const runSingle = useCallback(
    async (ix: Instruction) => {
      if (!projectId) return;
      const card = cards[ix.name] ?? makeDefaultCard(ix);
      setView("results");
      await startTest(projectId, [
          {
            name: `${ix.name} - manual`,
            instruction: ix.name,
            accounts: card.accounts,
            args: card.args,
            expectedResult:
              card.expectedResult === "success"
                ? "success"
                : { error: card.errorCode || "GenericError" },
          },
        ], runtime);
    },
    [cards, projectId, runtime, startTest],
  );

  // ─── run all ────────────────────────────────────────────────────
  const runAll = useCallback(async () => {
    if (!projectId) return;
    setView("results");
    await startTest(projectId, undefined, runtime);
  }, [projectId, runtime, startTest]);

  // ─── summary counts ─────────────────────────────────────────────
  const passed =
    testSummary?.passed ??
    testResults.filter((r) => r.status === "passed").length;
  const failed =
    testSummary?.failed ??
    testResults.filter((r) => r.status === "failed").length;
  const total = testSummary?.total ?? testResults.length;
  const allPassed = failed === 0 && total > 0 && testStatus === "passed";

  const copyResults = useCallback(async () => {
    const lines = testResults.map(
      (r) => `${r.status === "passed" ? "PASS" : r.status === "failed" ? "FAIL" : "SKIP"} ${r.name}${r.error ? ` — ${r.error}` : ""}${r.duration ? ` (${r.duration}ms)` : ""}`,
    );
    if (lines.length === 0) return;
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Test results copied");
  }, [testResults]);

  const copyRepro = useCallback(async () => {
    const lines = [
      testSetupCommand,
      testCommand,
    ].filter(Boolean);
    if (lines.length === 0) {
      toast.error("No repro command available yet");
      return;
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Repro command copied");
  }, [testCommand, testSetupCommand]);

  // ─── empty IR ───────────────────────────────────────────────────
  if (instructions.length === 0 && testResults.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        Generate code first — test forms will appear per instruction.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Tab bar ── */}
      <div className="flex h-9 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border bg-card px-2 [scrollbar-width:none]">
        <button
          onClick={() => setView("form")}
          className={`shrink-0 px-2 text-[12px] font-medium transition-colors duration-150 ease-out ${
            view === "form"
              ? "text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Test Builder
        </button>
        <button
          onClick={() => setView("results")}
          className={`shrink-0 px-2 text-[12px] font-medium transition-colors duration-150 ease-out ${
            view === "results"
              ? "text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Results
          {total > 0 && (
            <span
              className={`ml-1.5 rounded px-1 text-[11px] font-semibold ${
                allPassed
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {passed}/{total}
            </span>
          )}
        </button>

        {instructions.length > 0 && (
          <>
            <div role="group" aria-label="Test runtime" className="ml-auto flex h-6 shrink-0 items-center gap-0.5 self-center rounded-md bg-white/[0.03] p-0.5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              {(["cargo-smoke", "surfpool-simnet"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setRuntime(mode)}
                  disabled={testStatus === "running"}
                  className={`h-5 rounded-[4px] px-2 text-[11px] font-medium transition-colors duration-150 ease-out disabled:opacity-50 ${
                    runtime === mode
                      ? "bg-[#23262c] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.07)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "cargo-smoke" ? "Smoke" : "Simnet"}
                </button>
              ))}
            </div>
            <button
              onClick={runAll}
              disabled={testStatus === "running"}
              className="inline-flex h-7 shrink-0 self-center items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[background-color,transform] duration-150 ease-out hover:bg-[#7fe0e6] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
            >
              {testStatus === "running" ? "Running…" : "Run All"}
            </button>
            {testResults.length > 0 && (
              <button
                onClick={copyResults}
                title="Copy results to clipboard"
                aria-label="Copy results"
                className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground"
              >
                <Copy size={12} />
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Test Builder ── */}
      {view === "form" && (
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-white/[0.05]">
          {instructions.map((ix) => {
            const card = cards[ix.name] ?? makeDefaultCard(ix);
            const isExpanded = expanded[ix.name] ?? false;

            return (
              <div key={ix.id} className="px-3 py-2">
                {/* Card header */}
                <button
                  className="flex w-full items-center gap-2 text-left"
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [ix.name]: !e[ix.name] }))
                  }
                >
                  <span
                    className={`text-[11px] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  >
                    ▶
                  </span>
                  <span className="font-mono text-[12px] font-semibold">
                    {ix.name}
                  </span>
                  {ix.description && (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {ix.description}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {ix.accounts.length} accts · {(ix.args ?? []).length} args
                  </span>
                </button>

                {/* Expanded form */}
                {isExpanded && (
                  <div className="mt-2 space-y-3 pl-4">
                    {/* Accounts */}
                    {ix.accounts.length > 0 && (
                      <div>
                        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                          Accounts
                        </p>
                        <div className="space-y-1">
                          {ix.accounts.map((acc: Account) => {
                            const isSigner = acc.constraints.some(
                              (c) => c.type === "signer",
                            );
                            const isMut = acc.constraints.some(
                              (c) => c.type === "mut",
                            );
                            return (
                              <div
                                key={acc.id}
                                className="flex items-center gap-2"
                              >
                                <span className="w-32 shrink-0 truncate font-mono text-[11px]">
                                  {acc.name}
                                </span>
                                <span className="flex gap-1">
                                  {isSigner && (
                                    <span className="rounded bg-yellow-500/10 px-1 py-0.5 text-[11px] text-yellow-400">
                                      signer
                                    </span>
                                  )}
                                  {isMut && (
                                    <span className="rounded bg-blue-500/10 px-1 py-0.5 text-[11px] text-blue-400">
                                      mut
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="text"
                                  placeholder="pubkey or 'generate'"
                                  value={card.accounts[acc.name] ?? ""}
                                  onChange={(e) =>
                                    setAccountVal(
                                      ix.name,
                                      acc.name,
                                      e.target.value,
                                    )
                                  }
                                  className="flex-1 rounded-md border border-white/[0.08] bg-background/60 px-2 py-0.5 font-mono text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Args */}
                    {(ix.args ?? []).length > 0 && (
                      <div>
                        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                          Arguments
                        </p>
                        <div className="space-y-1">
                          {(ix.args ?? []).map((arg: InstructionArg) => (
                            <div
                              key={arg.name}
                              className="flex items-center gap-2"
                            >
                              <span className="w-32 shrink-0 truncate font-mono text-[11px]">
                                {arg.name}
                              </span>
                              <span className="shrink-0 rounded bg-muted/50 px-1 py-0.5 font-mono text-[11px] text-muted-foreground">
                                {typeLabel(arg.type)}
                              </span>
                              <input
                                type="text"
                                placeholder={
                                  defaultValueForType(arg.type) || "value"
                                }
                                value={card.args[arg.name] ?? ""}
                                onChange={(e) =>
                                  setArgVal(ix.name, arg.name, e.target.value)
                                }
                                className="flex-1 rounded-md border border-white/[0.08] bg-background/60 px-2 py-0.5 font-mono text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Expected result */}
                    <div className="flex items-center gap-3">
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        Expect
                      </p>
                      <label className="flex items-center gap-1 text-[11px]">
                        <input
                          type="radio"
                          name={`expect-${ix.name}`}
                          value="success"
                          checked={card.expectedResult === "success"}
                          onChange={() =>
                            setCards((prev) => ({
                              ...prev,
                              [ix.name]: {
                                ...prev[ix.name],
                                expectedResult: "success",
                              },
                            }))
                          }
                        />
                        Success
                      </label>
                      <label className="flex items-center gap-1 text-[11px]">
                        <input
                          type="radio"
                          name={`expect-${ix.name}`}
                          value="error"
                          checked={card.expectedResult === "error"}
                          onChange={() =>
                            setCards((prev) => ({
                              ...prev,
                              [ix.name]: {
                                ...prev[ix.name],
                                expectedResult: "error",
                              },
                            }))
                          }
                        />
                        Error
                      </label>
                      {card.expectedResult === "error" && (
                        <input
                          type="text"
                          placeholder="error code"
                          value={card.errorCode}
                          onChange={(e) =>
                            setCards((prev) => ({
                              ...prev,
                              [ix.name]: {
                                ...prev[ix.name],
                                errorCode: e.target.value,
                              },
                            }))
                          }
                          className="w-36 rounded-md border border-white/[0.08] bg-background/60 px-2 py-0.5 font-mono text-[11px] focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                        />
                      )}
                    </div>

                    {/* Run button */}
                    <button
                      onClick={() => runSingle(ix)}
                      disabled={testStatus === "running" || !projectId}
                      className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[background-color,transform] duration-150 ease-out hover:bg-[#7fe0e6] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                    >
                      Run {ix.name}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Results view ── */}
      {view === "results" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Summary bar */}
          {(testStatus !== "idle" || testResults.length > 0) && (
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-1.5 min-h-10 text-[12px]">
              <span
                className={
                  allPassed
                    ? "text-green-400 font-semibold"
                    : "text-red-400 font-semibold"
                }
              >
                {testStatus === "running"
                  ? "Running…"
                  : allPassed
                    ? "All tests passed"
                    : failed > 0
                      ? `${failed} failed`
                      : "No results yet"}
              </span>
              {total > 0 && (
                <>
                  <span className="text-green-400">{passed} passed</span>
                  {failed > 0 && (
                    <span className="text-red-400">{failed} failed</span>
                  )}
                  <span className="text-muted-foreground">{total} total</span>
                </>
              )}
              {testRunner && (
                <span className="rounded-md border border-white/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  runner: {testRunner}
                </span>
              )}
              {testRuntime && (
                <span className="rounded-md border border-white/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  runtime: {testRuntime}
                </span>
              )}
              {typeof testDuration === "number" && (
                <span className="text-muted-foreground">
                  {testDuration}ms
                </span>
              )}
              {(testCommand || testSetupCommand) && (
                <button
                  onClick={copyRepro}
                  className="ml-auto rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                >
                  Copy Repro
                </button>
              )}
              {testStatus === "running" && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                  Running tests…
                </span>
              )}
            </div>
          )}

          {(testCommand || testSetupCommand) && (
            <div className="shrink-0 space-y-1 border-b border-border/40 bg-background/40 px-4 py-2 font-mono text-[11px] text-muted-foreground">
              {testSetupCommand && <div>setup: {testSetupCommand}</div>}
              {testCommand && <div>command: {testCommand}</div>}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-white/[0.05]">
            {testResults.map((result, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span
                  className={`mt-0.5 text-[12px] font-bold shrink-0 ${
                    result.status === "passed"
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {result.status === "passed" ? "✓" : "✗"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">{result.name}</span>
                    {result.duration > 0 && (
                      <span className="text-[11px] text-muted-foreground/60">
                        {result.duration}ms
                      </span>
                    )}
                  </div>
                  {result.error && (
                    <p className="mt-0.5 font-mono text-[11px] text-red-300/80 break-all">
                      {result.error}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {testStatus === "running" && testResults.length === 0 && (
              <div className="flex h-24 items-center justify-center text-[12px] text-muted-foreground animate-pulse">
                Waiting for test results…
              </div>
            )}

            {testStatus === "idle" && testResults.length === 0 && (
              <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                Run tests from the Test Builder tab to see results here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
