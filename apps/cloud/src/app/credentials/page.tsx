"use client";

// Credentials Page — manage encrypted provider credentials for cloud nodes.

import React, { useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { trpc } from "@/lib/trpc/client";

const CREDENTIAL_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "birdeye", label: "Birdeye" },
  { value: "jupiter", label: "Jupiter" },
  { value: "helius", label: "Helius" },
  { value: "switchboard", label: "Switchboard" },
  { value: "squads", label: "Squads" },
  { value: "webhook", label: "Webhook" },
] as const;

type CredentialType = typeof CREDENTIAL_TYPES[number]["value"];

type FormState = {
  id?: string;
  label: string;
  type: CredentialType;
  apiKey: string;
  apiKeyHeader: string;
  bearerToken: string;
  baseUrl: string;
  headers: string;
};

const emptyForm: FormState = {
  label: "",
  type: "openai",
  apiKey: "",
  apiKeyHeader: "",
  bearerToken: "",
  baseUrl: "",
  headers: "",
};

const inputClass =
  "w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50";

function buildCredentialData(form: FormState, requireSecret: boolean): Record<string, unknown> | undefined {
  if (form.type === "webhook") {
    const data: Record<string, unknown> = {};
    if (form.bearerToken.trim()) data.bearerToken = form.bearerToken.trim();
    if (form.apiKey.trim()) data.apiKey = form.apiKey.trim();
    if (form.apiKeyHeader.trim()) data.apiKeyHeader = form.apiKeyHeader.trim();
    if (form.headers.trim()) data.headers = JSON.parse(form.headers);
    if (!Object.keys(data).length && requireSecret) {
      throw new Error("Webhook credentials need bearer token, API key, or headers");
    }
    return Object.keys(data).length ? data : undefined;
  }

  const data: Record<string, unknown> = {};
  if (form.apiKey.trim()) data.apiKey = form.apiKey.trim();
  if (form.type === "jupiter" && form.baseUrl.trim()) data.baseUrl = form.baseUrl.trim();
  if (form.type === "helius" && form.baseUrl.trim()) data.rpcUrl = form.baseUrl.trim();
  if (form.type === "switchboard" && form.baseUrl.trim()) data.apiUrl = form.baseUrl.trim();
  if (form.type === "squads" && form.baseUrl.trim()) data.apiUrl = form.baseUrl.trim();
  if (!data.apiKey && requireSecret) {
    throw new Error(`${form.type} credentials need an API key`);
  }
  return Object.keys(data).length ? data : undefined;
}

export default function CredentialsPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: credentials, isLoading } = trpc.credential.list.useQuery();

  const createCredential = trpc.credential.create.useMutation({
    onSuccess: () => {
      utils.credential.list.invalidate();
      setForm(null);
      setFormError(null);
    },
  });
  const updateCredential = trpc.credential.update.useMutation({
    onSuccess: () => {
      utils.credential.list.invalidate();
      setForm(null);
      setFormError(null);
    },
  });
  const deleteCredential = trpc.credential.delete.useMutation({
    onSuccess: () => utils.credential.list.invalidate(),
  });

  const save = () => {
    if (!form?.label.trim()) return;
    try {
      setFormError(null);
      const data = buildCredentialData(form, !form.id);
      if (form.id) {
        updateCredential.mutate({
          id: form.id,
          label: form.label.trim(),
          ...(data ? { data } : {}),
        });
      } else if (data) {
        createCredential.mutate({
          label: form.label.trim(),
          type: form.type,
          data,
        });
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const pending = createCredential.isPending || updateCredential.isPending;

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Credentials</h1>
          <p className="text-xs text-muted-foreground">
            Encrypted provider secrets for workflow nodes
          </p>
        </div>
        <button
          onClick={() => setForm(emptyForm)}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={13} />
          Add Credential
        </button>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <Shield className="mt-0.5 shrink-0 text-blue-400" size={16} />
        <div>
          <p className="text-xs font-medium text-blue-400">Encrypted at rest</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Secrets are stored server-side with AES-256-GCM and never returned to the browser.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {credentials?.length ? credentials.map((credential) => (
            <div
              key={credential.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <KeyRound size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{credential.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {credential.type} · Created {new Date(credential.createdAt).toLocaleDateString()}
                    {credential.lastUsedAt ? ` · Used ${new Date(credential.lastUsedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setForm({ ...emptyForm, id: credential.id, label: credential.label, type: credential.type as CredentialType })}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Edit credential"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this credential? Running workflows using it will fail.")) {
                      deleteCredential.mutate({ id: credential.id });
                    }
                  }}
                  disabled={deleteCredential.isPending}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-red-400/70 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                  title="Delete credential"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <KeyRound className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No credentials yet</p>
              <p className="mb-4 text-xs text-muted-foreground/60">
                Add provider keys for AI, price, Jupiter, Helius, Switchboard, Squads, or webhook nodes
              </p>
            </div>
          )}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl">
            <h2 className="mb-4 text-sm font-bold">
              {form.id ? "Edit Credential" : "Add Credential"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Label</label>
                <input
                  className={inputClass}
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Production OpenAI"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Type</label>
                <select
                  className={inputClass}
                  value={form.type}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, type: e.target.value as CredentialType })}
                >
                  {CREDENTIAL_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              {form.type === "webhook" ? (
                <>
                  <input className={inputClass} value={form.bearerToken} onChange={(e) => setForm({ ...form, bearerToken: e.target.value })} placeholder={form.id ? "New bearer token (optional)" : "Bearer token"} />
                  <input className={inputClass} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={form.id ? "New API key (optional)" : "API key"} />
                  <input className={inputClass} value={form.apiKeyHeader} onChange={(e) => setForm({ ...form, apiKeyHeader: e.target.value })} placeholder="API key header, default X-API-Key" />
                  <textarea className={`${inputClass} font-mono text-[11px]`} rows={3} value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} placeholder='{"X-Signature": "..."}' />
                </>
              ) : (
                <>
                  <input className={inputClass} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={form.id ? "New API key (optional)" : "API key"} />
                  {["jupiter", "helius", "switchboard", "squads"].includes(form.type) && (
                    <input
                      className={inputClass}
                      value={form.baseUrl}
                      onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                      placeholder={
                        form.type === "helius"
                          ? "Optional Helius RPC URL"
                          : form.type === "switchboard"
                            ? "Optional Switchboard API URL"
                            : form.type === "squads"
                              ? "Optional Squads API URL"
                              : "Optional Jupiter base URL"
                      }
                    />
                  )}
                </>
              )}

              {(formError || createCredential.error || updateCredential.error) && (
                <p className="text-[11px] text-red-400">
                  {formError ?? createCredential.error?.message ?? updateCredential.error?.message}
                </p>
              )}
              {form.id && (
                <p className="text-[10px] text-muted-foreground/60">
                  Leave secret fields empty to keep the existing encrypted value.
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { setForm(null); setFormError(null); }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!form.label.trim() || pending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pending && <Loader2 size={12} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
