"use client";

// CloudPropertiesPanel — right sidebar for editing selected node properties.

import React from "react";
import Link from "next/link";
import { X, Settings, Trash2, Copy, Plus, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useWorkflowStore } from "@/store/workflow-store";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { trpc } from "@/lib/trpc/client";
import type { CloudFlowNodeData, CloudSafetyControls, NodeProperty } from "@solflow/cloud-nodes";
import { assessCloudSafetyPolicy, getIconByName, CATEGORY_LABELS } from "@solflow/cloud-nodes";
import { edBtn, edIconBtn, edInput, edLabel, edPanelHeader, edPanelTitle, edx } from "./editor-chrome";

// ─── Field helpers ────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className={`block ${edLabel}`}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass = edx(edInput, "h-8 px-2.5");

const selectClass = edx(edInput, "h-8");

// Textareas size by rows, not by the 28px input height
const textareaClass = edx(edInput, "h-auto px-2.5 py-1.5 leading-relaxed resize-y font-mono text-[11.5px]");

const checkLabel = "flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground/90";

const linkClass =
  "inline-flex items-center gap-1 rounded-sm text-[11.5px] font-medium text-primary outline-none hover:underline hover:decoration-primary/40 hover:underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary";

const LAMPORTS_PER_SOL = 1_000_000_000;
const CREDENTIAL_TYPES = [
  "openai",
  "anthropic",
  "gemini",
  "birdeye",
  "jupiter",
  "helius",
  "switchboard",
  "squads",
  "webhook",
] as const;

type CredentialType = (typeof CREDENTIAL_TYPES)[number];

function isCredentialType(value: string): value is CredentialType {
  return (CREDENTIAL_TYPES as readonly string[]).includes(value);
}

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
  const types = (
    property.credentialTypes ?? (property.credentialType ? [property.credentialType] : undefined)
  )?.filter(isCredentialType);
  const { data: credentials, isLoading } = trpc.credential.list.useQuery(
    types?.length ? { types } : undefined,
  );
  const createHref = `/credentials${types?.[0] ? `?type=${encodeURIComponent(types[0])}` : ""}`;
  const typeLabel = types?.length === 1 ? types[0] : "provider";

  return (
    <div className="space-y-1.5">
      <select
        className={selectClass}
        value={value !== undefined && value !== null ? String(value) : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{isLoading ? "Loading..." : "No credential selected"}</option>
        {credentials?.map((credential) => (
          <option key={credential.id} value={credential.id}>
            {credential.label} ({credential.type})
          </option>
        ))}
      </select>
      <Link
        href={createHref}
        className={linkClass}
      >
        <Plus size={11} />
        Add {typeLabel} credential
      </Link>
    </div>
  );
}

function WalletSelect({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { data: wallets, isLoading } = trpc.wallet.list.useQuery();

  return (
    <div className="space-y-1.5">
      <select
        className={selectClass}
        value={value !== undefined && value !== null ? String(value) : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{isLoading ? "Loading..." : "Select a Cloud wallet"}</option>
        {wallets?.map((wallet) => (
          <option key={wallet.id} value={wallet.id}>
            {wallet.label} ({wallet.network})
          </option>
        ))}
      </select>
      <Link
        href="/wallets"
        className={linkClass}
      >
        <Plus size={11} />
        Create Cloud wallet
      </Link>
    </div>
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

    case "wallet-select":
      return <WalletSelect value={value} onChange={onChange} />;

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
        <label className={checkLabel}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded"
          />
          <span>{property.label}</span>
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
          className={textareaClass}
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

// ─── Webhook secret (owner-only reveal / copy / rotate) ─────────────────────

function WebhookSecretSection({ workflowId }: { workflowId: string | null }) {
  const [revealed, setRevealed] = React.useState(false);
  const [confirmRotate, setConfirmRotate] = React.useState(false);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.workflow.getWebhookSecret.useQuery(
    { id: workflowId ?? "" },
    { enabled: Boolean(workflowId), staleTime: 60_000 },
  );
  const rotate = trpc.workflow.rotateWebhookSecret.useMutation({
    onSuccess: (next) => {
      utils.workflow.getWebhookSecret.setData({ id: workflowId ?? "" }, next);
      setConfirmRotate(false);
      setRevealed(true);
      toast.success("Webhook secret rotated. Update your sender.");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!workflowId) return null;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const url =
    data?.webhookPath && typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/${data.webhookPath}`
      : null;
  const secret = data?.webhookSecret ?? null;

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className={edLabel}>Webhook URL</p>
      {url ? (
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">{url}</code>
          <button className={edIconBtn} onClick={() => copy(url, "Webhook URL")} aria-label="Copy webhook URL" title="Copy">
            <Copy size={12} />
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/70">
          {isLoading ? "Loading..." : "Activate the workflow to get a URL."}
        </p>
      )}

      <p className={edLabel}>Secret</p>
      {secret ? (
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
            {revealed ? secret : "•".repeat(24)}
          </code>
          <button
            className={edIconBtn}
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide secret" : "Reveal secret"}
            title={revealed ? "Hide" : "Reveal"}
          >
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button className={edIconBtn} onClick={() => copy(secret, "Secret")} aria-label="Copy secret" title="Copy">
            <Copy size={12} />
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/70">
          {isLoading ? "Loading..." : "No secret yet. Activate the workflow or rotate to create one."}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        Send it in the auth header (Header Auth), or use it as the HMAC key for X-Webhook-Signature (Replay Protection).
      </p>
      {confirmRotate ? (
        <div className="flex gap-1.5">
          <button
            className={edx(edBtn, "h-7 flex-1 justify-center text-red-400")}
            disabled={rotate.isPending}
            onClick={() => rotate.mutate({ id: workflowId })}
          >
            {rotate.isPending ? "Rotating..." : "Rotate now"}
          </button>
          <button className={edx(edBtn, "h-7 flex-1 justify-center")} onClick={() => setConfirmRotate(false)}>
            Keep
          </button>
        </div>
      ) : (
        <button className={edx(edBtn, "h-7 w-full justify-center")} onClick={() => setConfirmRotate(true)}>
          <RefreshCw size={12} />
          {secret ? "Rotate secret" : "Create secret"}
        </button>
      )}
      {confirmRotate && secret && (
        <p className="text-[11px] text-muted-foreground/70">The old secret stops working at once.</p>
      )}
    </div>
  );
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
  const workflowId = useWorkflowStore((s) => s.workflowId);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!propertiesOpen) return null;

  const data = selectedNode?.data as CloudFlowNodeData | undefined;
  const nodeData = data?.data ?? {};

  return (
    <aside
      aria-label="Properties"
      className="flex h-full w-[280px] shrink-0 flex-col border-l border-border bg-card"
    >
      {/* Header */}
      <div className={edx(edPanelHeader, "justify-between pr-1.5")}>
        <div className="flex min-w-0 items-center gap-2">
          {data && (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] [&_svg]:h-3 [&_svg]:w-3"
              style={{ background: `${data.color}24`, color: data.color }}
            >
              {getIconByName(data.icon)}
            </span>
          )}
          <p className={edx(edPanelTitle, "truncate")}>
            {data ? data.label : "Properties"}
          </p>
        </div>
        <button
          onClick={toggleProperties}
          className={edIconBtn}
          aria-label="Close properties"
          title="Close properties"
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
                className="inline-flex h-5 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] font-medium text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: data.color }}
                />
                {CATEGORY_LABELS[data.category]}
              </span>
              <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground/50">
                {data.type}
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
                    });
                  }}
                />
                {prop.description && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                    {prop.description}
                  </p>
                )}
              </FieldRow>
            ))}

            {data.type === "trigger:webhook" && (
              <WebhookSecretSection workflowId={workflowId} />
            )}

            {/* Ports info */}
            {data.inputs.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className={`mb-1.5 ${edLabel}`}>
                  Inputs
                </p>
                {data.inputs.map((p) => (
                  <span
                    key={p.label}
                    className="mb-1 mr-1 inline-flex h-5 items-center rounded-[5px] bg-white/[0.04] px-1.5 font-mono text-[11px] text-foreground/80 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]"
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            )}

            {data.outputs.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className={`mb-1.5 ${edLabel}`}>
                  Outputs
                </p>
                {data.outputs.map((p) => (
                  <span
                    key={p.label}
                    className="mb-1 mr-1 inline-flex h-5 items-center rounded-[5px] bg-primary/10 px-1.5 font-mono text-[11px] text-primary shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)]"
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-1.5 border-t border-border pt-3">
              <button
                onClick={() =>
                  useWorkflowStore.getState().duplicateNodes([selectedNode.id])
                }
                className={edx(edBtn, "h-8 flex-1 justify-center")}
              >
                <Copy size={12} />
                Duplicate
              </button>
              <button
                onClick={() => removeNode(selectedNode.id)}
                className={edx(
                  edBtn,
                  "h-8 flex-1 justify-center bg-red-500/[0.06] text-red-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_rgba(248,113,113,0.22)] hover:bg-red-500/[0.12] hover:text-red-300",
                )}
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
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
      <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.02] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-primary/10 text-primary">
            <Settings className="h-3 w-3" />
          </span>
          <p className="text-[12.5px] font-semibold tracking-[-0.005em]">Workflow safety</p>
        </div>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          These controls are saved with the workflow and enforced before wallet actions or webhook execution.
        </p>
      </div>

      <div
        className={`rounded-[10px] border p-3 ${
          assessment.level === "ready"
            ? "border-green-500/20 bg-green-500/[0.07]"
            : assessment.level === "weak"
              ? "border-amber-500/20 bg-amber-500/[0.07]"
              : "border-primary/20 bg-primary/[0.06]"
        }`}
      >
        <p className="flex items-center gap-2 text-[12.5px] font-semibold">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              assessment.level === "ready"
                ? "bg-green-400"
                : assessment.level === "weak"
                  ? "bg-amber-400"
                  : "bg-primary"
            }`}
          />
          {assessment.level === "ready"
            ? "Automation policy ready"
            : assessment.level === "weak"
              ? "Automation policy needs limits"
              : "Manual approval mode"}
        </p>
        <div className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-muted-foreground">
          {[...assessment.issues, ...assessment.warnings].slice(0, 4).map((item) => (
            <p key={item}>- {item}</p>
          ))}
          {assessment.level === "ready" && (
            <p>Wallet actions can run automatically under the saved limits.</p>
          )}
        </div>
      </div>

      <FieldRow label="Simulation required">
        <label className={checkLabel}>
          <input
            type="checkbox"
            checked={safety.simulationRequired !== false}
            onChange={(event) => onChange({ simulationRequired: event.target.checked })}
            className="h-3.5 w-3.5 rounded"
          />
          <span>Require simulation before signing</span>
        </label>
      </FieldRow>

      <FieldRow label="Manual approval">
        <label className={checkLabel}>
          <input
            type="checkbox"
            checked={safety.manualApprovalRequired !== false}
            onChange={(event) => onChange({ manualApprovalRequired: event.target.checked })}
            className="h-3.5 w-3.5 rounded"
          />
          <span>Pause wallet actions for review</span>
        </label>
      </FieldRow>

      <FieldRow label="Wallet automation">
        <label className={checkLabel}>
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
            className="h-3.5 w-3.5 rounded"
          />
          <span>Allow signing without per-run approval</span>
        </label>
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
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
          className={textareaClass}
          rows={4}
          value={formatList(safety.allowedMints)}
          onChange={(event) => onChange({ allowedMints: parseList(event.target.value) })}
          placeholder="One mint per line"
          spellCheck={false}
        />
      </FieldRow>

      <FieldRow label="Webhook allowlist">
        <textarea
          className={textareaClass}
          rows={4}
          value={formatList(safety.webhookAllowlist)}
          onChange={(event) => onChange({ webhookAllowlist: parseList(event.target.value) })}
          placeholder="Client IP or CIDR per line (e.g. 203.0.113.7, 10.0.0.0/8)"
          spellCheck={false}
        />
      </FieldRow>
    </div>
  );
}
