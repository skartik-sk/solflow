"use client";

// CloudPropertiesPanel — right sidebar for editing selected node properties.

import React from "react";
import { X, Settings, Trash2, Copy } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { trpc } from "@/lib/trpc/client";
import type { CloudFlowNodeData, NodeProperty } from "@solflow/cloud-nodes";
import { getIconByName, CATEGORY_LABELS } from "@solflow/cloud-nodes";

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
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
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
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Settings className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Select a node to edit its properties
            </p>
          </div>
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
