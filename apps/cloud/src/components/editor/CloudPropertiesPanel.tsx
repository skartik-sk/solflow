"use client";

// CloudPropertiesPanel — right sidebar for editing selected node properties.

import React from "react";
import { X, Settings, Trash2, Copy } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { trpc } from "@/lib/trpc/client";
import type { CloudFlowNodeData, CloudSafetyControls, NodeProperty } from "@solflow/cloud-nodes";
import { assessCloudSafetyPolicy, getIconByName, CATEGORY_LABELS } from "@solflow/cloud-nodes";

// ─── Field helpers ────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50";

const selectClass =
  "w-full rounded-md border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary";

const LAMPORTS_PER_SOL = 1_000_000_000;

function formatList(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// ─── Dynamic Property Form ────────────────────────────────────────────────────

function CredentialSelect({
  property,
  value,
  onChange,
}: {
  property: NodeProperty;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const types = property.credentialTypes ?? (property.credentialType ? [property.credentialType] : undefined);
  const { data: credentials, isLoading } = trpc.credential.list.useQuery(
    types?.length ? { types: types as any } : undefined,
  );

  return (
    <select
      className={selectClass}
      value={value !== undefined && value !== null ? String(value) : ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{isLoading ? "Loading..." : "No credential"}</option>
      {credentials?.map((credential) => (
        <option key={credential.id} value={credential.id}>
          {credential.label} ({credential.type})
        </option>
      ))}
    </select>
  );
}

function PropertyField({
  property,
  value,
  onChange,
}: {
  property: NodeProperty;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const strValue = value !== undefined && value !== null ? String(value) : "";

  switch (property.type) {
    case "credential":
      return (
        <CredentialSelect
          property={property}
          value={value}
          onChange={onChange}
        />
      );

    case "text":
    case "pubkey":
    case "address":
    case "expression":
    case "duration":
      return (
        <input
          className={inputClass}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={property.placeholder}
        />
      );

    case "number":
      return (
        <input
          className={inputClass}
          type="number"
          value={strValue}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          placeholder={property.placeholder}
        />
      );

    case "boolean":
      return (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs">{property.label}</span>
        </label>
      );

    case "select":
      return (
        <select
          className={selectClass}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select...</option>
          {property.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case "json":
    case "code":
      return (
        <textarea
          className={`${inputClass} resize-y font-mono text-[11px]`}
          rows={4}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={property.placeholder}
          spellCheck={false}
        />
      );

    case "date":
      return (
        <input
          className={inputClass}
          type="datetime-local"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      return (
        <input
          className={inputClass}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={property.placeholder}
        />
      );
  }
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function CloudPropertiesPanel() {
  const { propertiesOpen, toggleProperties } = useEditorUIStore();
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const workflowSettings = useWorkflowStore((s) => s.workflowSettings);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const updateWorkflowSafety = useWorkflowStore((s) => s.updateWorkflowSafety);
  const removeNode = useWorkflowStore((s) => s.removeNode);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!propertiesOpen) return null;

  const data = selectedNode?.data as CloudFlowNodeData | undefined;
  const nodeData = data?.data ?? {};

  return (
    <div className="flex h-full w-[280px] flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          {data && (
            <span
              className="flex h-5 w-5 items-center justify-center rounded"
              style={{ background: `${data.color}22`, color: data.color }}
            >
              {getIconByName(data.icon)}
            </span>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {data ? data.label : "Properties"}
          </p>
        </div>
        <button
          onClick={toggleProperties}
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {!selectedNode || !data ? (
          <WorkflowSafetySettings
            safety={workflowSettings.safety ?? {}}
            onChange={updateWorkflowSafety}
          />
        ) : (
          <div className="space-y-3">
            {/* Category badge */}
            <div className="flex items-center gap-2">
              <span
                className="rounded px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: `${data.color}22`,
                  color: data.color,
                }}
              >
                {CATEGORY_LABELS[data.category]}
              </span>
            </div>

            {/* Dynamic properties */}
            {data.properties.map((prop) => (
              <FieldRow key={prop.key} label={prop.label}>
                <PropertyField
                  property={prop}
                  value={nodeData[prop.key]}
                  onChange={(val) => {
                    updateNodeData(selectedNode.id, {
                      [prop.key]: val,
                      data: { ...nodeData, [prop.key]: val },
                    });
                  }}
                />
                {prop.description && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {prop.description}
                  </p>
                )}
              </FieldRow>
            ))}

            {/* Ports info */}
            {data.inputs.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/40 mb-1">
                  Inputs
                </p>
                {data.inputs.map((p) => (
                  <span
                    key={p.label}
                    className="mr-1 mb-1 inline-block rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400"
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            )}

            {data.outputs.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/40 mb-1">
                  Outputs
                </p>
                {data.outputs.map((p) => (
                  <span
                    key={p.label}
                    className="mr-1 mb-1 inline-block rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400"
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 border-t border-border space-y-1.5">
              <button
                onClick={() =>
                  useWorkflowStore.getState().duplicateNodes([selectedNode.id])
                }
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground/80 hover:bg-accent transition-colors"
              >
                <Copy size={12} />
                Duplicate
              </button>
              <button
                onClick={() => removeNode(selectedNode.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowSafetySettings({
  safety,
  onChange,
}: {
  safety: CloudSafetyControls;
  onChange: (safety: Partial<CloudSafetyControls>) => void;
}) {
  const assessment = assessCloudSafetyPolicy(safety);
  const spendLimitSol =
    typeof safety.spendLimitLamports === "number" && Number.isFinite(safety.spendLimitLamports)
      ? String(safety.spendLimitLamports / LAMPORTS_PER_SOL)
      : "";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-background/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold">Workflow Safety</p>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          These controls are saved with the workflow and enforced before wallet actions or webhook execution.
        </p>
      </div>

      <div
        className={`rounded-lg border p-3 ${
          assessment.level === "ready"
            ? "border-emerald-500/25 bg-emerald-500/10"
            : assessment.level === "weak"
              ? "border-amber-500/25 bg-amber-500/10"
              : "border-blue-500/20 bg-blue-500/10"
        }`}
      >
        <p className="text-xs font-semibold">
          {assessment.level === "ready"
            ? "Automation policy ready"
            : assessment.level === "weak"
              ? "Automation policy needs limits"
              : "Manual approval mode"}
        </p>
        <div className="mt-1 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
          {[...assessment.issues, ...assessment.warnings].slice(0, 4).map((item) => (
            <p key={item}>- {item}</p>
          ))}
          {assessment.level === "ready" && (
            <p>Wallet actions can run automatically under the saved limits.</p>
          )}
        </div>
      </div>

      <FieldRow label="Simulation required">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={safety.simulationRequired !== false}
            onChange={(event) => onChange({ simulationRequired: event.target.checked })}
            className="rounded"
          />
          <span className="text-xs">Require simulation before signing</span>
        </label>
      </FieldRow>

      <FieldRow label="Manual approval">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={safety.manualApprovalRequired !== false}
            onChange={(event) => onChange({ manualApprovalRequired: event.target.checked })}
            className="rounded"
          />
          <span className="text-xs">Pause wallet actions for review</span>
        </label>
      </FieldRow>

      <FieldRow label="Wallet automation">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={safety.walletAutomationAllowed === true}
            onChange={(event) =>
              onChange({
                walletAutomationAllowed: event.target.checked,
                manualApprovalRequired: event.target.checked
                  ? false
                  : safety.manualApprovalRequired !== false,
              })
            }
            className="rounded"
          />
          <span className="text-xs">Allow signing without per-run approval</span>
        </label>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/60">
          Leave this off unless the workflow has tight spend, mint, and slippage limits.
        </p>
      </FieldRow>

      <FieldRow label="Spend limit (SOL)">
        <input
          className={inputClass}
          type="number"
          min="0"
          step="0.001"
          value={spendLimitSol}
          onChange={(event) => {
            const parsed = optionalNumber(event.target.value);
            onChange({
              spendLimitLamports:
                parsed === undefined ? undefined : Math.floor(parsed * LAMPORTS_PER_SOL),
            });
          }}
          placeholder="No native SOL limit"
        />
      </FieldRow>

      <FieldRow label="Max slippage (bps)">
        <input
          className={inputClass}
          type="number"
          min="0"
          max="10000"
          value={safety.maxSlippageBps ?? ""}
          onChange={(event) => onChange({ maxSlippageBps: optionalNumber(event.target.value) })}
          placeholder="100"
        />
      </FieldRow>

      <FieldRow label="Allowed mints">
        <textarea
          className={`${inputClass} resize-y font-mono text-[11px]`}
          rows={4}
          value={formatList(safety.allowedMints)}
          onChange={(event) => onChange({ allowedMints: parseList(event.target.value) })}
          placeholder="One mint per line"
          spellCheck={false}
        />
      </FieldRow>

      <FieldRow label="Webhook allowlist">
        <textarea
          className={`${inputClass} resize-y font-mono text-[11px]`}
          rows={4}
          value={formatList(safety.webhookAllowlist)}
          onChange={(event) => onChange({ webhookAllowlist: parseList(event.target.value) })}
          placeholder="IP, host, or origin per line"
          spellCheck={false}
        />
      </FieldRow>
    </div>
  );
}
