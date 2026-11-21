"use client";

// Credentials Page — manage encrypted provider credentials for cloud nodes.

import React, { useState } from "react";
import { KeyRound, Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { trpc } from "@/lib/trpc/client";
import { Dialog, EmptyPanel, Field, PageHeader, SkeletonRows, btnGhost, btnPrimary, iconBtn, iconBtnDanger, inputClass, panel, rowClass } from "@/components/ui-kit/cloud-ui";
import { KeysMini } from "@/components/ui-kit/cloud-minis";

const CREDENTIAL_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "birdeye", label: "Birdeye" },
  { value: "jupiter", label: "Jupiter" },
  { value: "helius", label: "Helius" },
  { value: "rpcfast", label: "RPCFast" },
  { value: "quicknode", label: "QuickNode" },
  { value: "alchemy", label: "Alchemy" },
  { value: "triton", label: "Triton" },
  { value: "jito", label: "Jito" },
  { value: "discord", label: "Discord" },
  { value: "telegram", label: "Telegram" },
  { value: "dialect", label: "Dialect" },
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

const RPC_ENDPOINT_TYPES: CredentialType[] = ["helius", "rpcfast", "quicknode", "alchemy", "triton"];
const API_URL_TYPES: CredentialType[] = ["jupiter", "switchboard", "squads", "dialect"];

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

  if (form.type === "discord") {
    const data: Record<string, unknown> = {};
    if (form.baseUrl.trim()) data.webhookUrl = form.baseUrl.trim();
    if (!data.webhookUrl && requireSecret) {
      throw new Error("Discord credentials need a webhook URL");
    }
    return Object.keys(data).length ? data : undefined;
  }

  if (form.type === "telegram") {
    const data: Record<string, unknown> = {};
    if (form.apiKey.trim()) data.botToken = form.apiKey.trim();
    if (!data.botToken && requireSecret) {
      throw new Error("Telegram credentials need a bot token");
    }
    return Object.keys(data).length ? data : undefined;
  }

  const data: Record<string, unknown> = {};
  if (form.apiKey.trim()) data.apiKey = form.apiKey.trim();
  if (form.type === "jupiter" && form.baseUrl.trim()) data.baseUrl = form.baseUrl.trim();
  if (form.type === "helius" && form.baseUrl.trim()) data.rpcUrl = form.baseUrl.trim();
  if (form.type === "rpcfast" && form.baseUrl.trim()) data.rpcUrl = form.baseUrl.trim();
  if (form.type === "quicknode" && form.baseUrl.trim()) data.rpcUrl = form.baseUrl.trim();
  if (form.type === "alchemy" && form.baseUrl.trim()) data.rpcUrl = form.baseUrl.trim();
  if (form.type === "triton" && form.baseUrl.trim()) data.rpcUrl = form.baseUrl.trim();
  if (form.type === "switchboard" && form.baseUrl.trim()) data.apiUrl = form.baseUrl.trim();
  if (form.type === "squads" && form.baseUrl.trim()) data.apiUrl = form.baseUrl.trim();
  if (form.type === "dialect" && form.baseUrl.trim()) data.apiUrl = form.baseUrl.trim();
  if (["rpcfast", "quicknode", "alchemy", "triton"].includes(form.type) && !data.apiKey && !data.rpcUrl && requireSecret) {
    throw new Error(`${form.type} credentials need an API key or HTTPS RPC endpoint`);
  }
  if (!["rpcfast", "quicknode", "alchemy", "triton"].includes(form.type) && !data.apiKey && requireSecret) {
    throw new Error(`${form.type} credentials need an API key`);
  }
  return Object.keys(data).length ? data : undefined;
}

export default function CredentialsPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [openedFromQuery, setOpenedFromQuery] = useState(false);
  const [queryCredentialType, setQueryCredentialType] = useState<CredentialType | null>(null);
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
  React.useEffect(() => {
    const queryType = new URLSearchParams(window.location.search).get("type");
    setQueryCredentialType(
      CREDENTIAL_TYPES.some((type) => type.value === queryType)
        ? (queryType as CredentialType)
        : null,
    );
  }, []);

  React.useEffect(() => {
    if (openedFromQuery || !queryCredentialType) return;
    setOpenedFromQuery(true);
    setForm({ ...emptyForm, type: queryCredentialType });
  }, [openedFromQuery, queryCredentialType]);

  const closeForm = () => { setForm(null); setFormError(null); };
  const typeLabel = (value: string) => CREDENTIAL_TYPES.find((t) => t.value === value)?.label ?? value;

  return (
    <AppShell>
      <PageHeader
        title="Credentials"
        description={
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3 w-3" aria-hidden />
            Encrypted at rest with AES-256-GCM. Secrets are never returned to the browser.
          </span>
        }
        actions={
          <button
            type="button"
            onClick={() => setForm({ ...emptyForm, type: queryCredentialType ?? "openai" })}
            className={btnPrimary}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add credential
          </button>
        }
      />

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : credentials?.length ? (
        <div className={panel}>
          <div className="hidden h-9 grid-cols-[minmax(0,1fr)_120px_110px_110px_72px] items-center gap-4 border-b border-white/[0.07] px-4 text-[12px] text-muted-foreground md:grid">
            <span>Label</span>
            <span>Provider</span>
            <span>Created</span>
            <span>Last used</span>
            <span />
          </div>
          {credentials.map((credential) => (
            <div
              key={credential.id}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_120px_110px_110px_72px] md:gap-4 ${rowClass}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-white/[0.07] bg-background text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{credential.label}</p>
                  {/* Phones: provider and dates under the label */}
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground md:hidden">
                    {credential.type} · Created {new Date(credential.createdAt).toLocaleDateString()}
                    {credential.lastUsedAt ? ` · Used ${new Date(credential.lastUsedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
              </div>
              <span className="hidden truncate text-[12.5px] text-muted-foreground md:block">{typeLabel(credential.type)}</span>
              <span className="hidden text-[12.5px] tabular-nums text-muted-foreground md:block">
                {new Date(credential.createdAt).toLocaleDateString()}
              </span>
              <span className="hidden text-[12.5px] tabular-nums text-muted-foreground md:block">
                {credential.lastUsedAt ? new Date(credential.lastUsedAt).toLocaleDateString() : "Never"}
              </span>
              <div className="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  onClick={() => setForm({ ...emptyForm, id: credential.id, label: credential.label, type: credential.type as CredentialType })}
                  className={iconBtn}
                  title="Edit credential"
                  aria-label={`Edit ${credential.label}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this credential? Running workflows using it will fail.")) {
                      deleteCredential.mutate({ id: credential.id });
                    }
                  }}
                  disabled={deleteCredential.isPending}
                  className={iconBtnDanger}
                  title="Delete credential"
                  aria-label={`Delete ${credential.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel
          title="No credentials yet"
          body="Add provider keys for AI, Solana RPC, Jupiter, Helius, Jito, notifications, Squads, or webhook nodes."
          art={<KeysMini />}
          actions={
            <button
              type="button"
              onClick={() => setForm({ ...emptyForm, type: queryCredentialType ?? "openai" })}
              className={btnPrimary}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add credential
            </button>
          }
        />
      )}

      {form && (
        <Dialog
          title={form.id ? "Edit credential" : "Add credential"}
          description={form.id ? "Leave secret fields empty to keep the existing encrypted value." : "Stored encrypted on the server. You won't be able to read it back."}
          onClose={closeForm}
          footer={
            <>
              <button type="button" onClick={closeForm} className={btnGhost}>
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!form.label.trim() || pending}
                className={btnPrimary}
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Save
              </button>
            </>
          }
        >
          <div className="space-y-3.5">
            <Field label="Label" htmlFor="cred-label">
              <input
                id="cred-label"
                className={inputClass}
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Production OpenAI"
                autoComplete="off"
                autoFocus
              />
            </Field>
            <Field label="Type" htmlFor="cred-type">
              <select
                id="cred-type"
                className={inputClass}
                value={form.type}
                disabled={!!form.id}
                onChange={(e) => setForm({ ...form, type: e.target.value as CredentialType })}
              >
                {CREDENTIAL_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </Field>

            {/* Secret fields are masked (type=password) and never prefilled */}
            {form.type === "webhook" ? (
              <>
                <Field label="Bearer token" htmlFor="cred-bearer">
                  <input id="cred-bearer" type="password" autoComplete="off" className={inputClass} value={form.bearerToken} onChange={(e) => setForm({ ...form, bearerToken: e.target.value })} placeholder={form.id ? "New bearer token (optional)" : "Bearer token"} />
                </Field>
                <Field label="API key" htmlFor="cred-key">
                  <input id="cred-key" type="password" autoComplete="off" className={inputClass} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={form.id ? "New API key (optional)" : "API key"} />
                </Field>
                <Field label="API key header" htmlFor="cred-header">
                  <input id="cred-header" autoComplete="off" className={inputClass} value={form.apiKeyHeader} onChange={(e) => setForm({ ...form, apiKeyHeader: e.target.value })} placeholder="API key header, default X-API-Key" />
                </Field>
                <Field label="Headers (JSON)" htmlFor="cred-headers">
                  <textarea id="cred-headers" className={`${inputClass} h-auto py-2 font-mono sm:text-[12px]`} rows={3} value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} placeholder='{"X-Signature": "..."}' />
                </Field>
              </>
            ) : form.type === "discord" ? (
              <Field label="Webhook URL" htmlFor="cred-url">
                <input
                  id="cred-url"
                  type="password"
                  autoComplete="off"
                  className={inputClass}
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder={form.id ? "New Discord webhook URL (optional)" : "Discord webhook URL"}
                />
              </Field>
            ) : (
              <>
                <Field label={form.type === "telegram" ? "Bot token" : "API key"} htmlFor="cred-key">
                  <input
                    id="cred-key"
                    type="password"
                    autoComplete="off"
                    className={inputClass}
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder={
                      form.id
                        ? "New API key (optional)"
                        : form.type === "gemini"
                          ? "Gemini API key"
                          : form.type === "telegram"
                            ? "Telegram bot token"
                            : ["rpcfast", "quicknode", "alchemy", "triton"].includes(form.type)
                              ? `${form.type} API key (optional if endpoint includes it)`
                            : "API key"
                    }
                  />
                </Field>
                {[...API_URL_TYPES, ...RPC_ENDPOINT_TYPES].includes(form.type) && (
                  <Field label={RPC_ENDPOINT_TYPES.includes(form.type) ? "RPC endpoint" : "API URL"} htmlFor="cred-url">
                    <input
                      id="cred-url"
                      // RPC endpoint URLs usually carry the provider key, so they are masked too
                      type={RPC_ENDPOINT_TYPES.includes(form.type) ? "password" : "text"}
                      autoComplete="off"
                      className={inputClass}
                      value={form.baseUrl}
                      onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                      placeholder={
                        form.type === "helius"
                          ? "Optional Helius RPC URL"
                        : form.type === "rpcfast"
                            ? "RPCFast HTTPS endpoint from dashboard"
                            : form.type === "quicknode"
                              ? "QuickNode Solana endpoint URL"
                              : form.type === "alchemy"
                                ? "Optional Alchemy Solana RPC URL"
                                : form.type === "triton"
                                  ? "Triton Solana endpoint URL"
                            : form.type === "switchboard"
                              ? "Optional Switchboard API URL"
                              : form.type === "squads"
                                ? "Optional Squads API URL"
                                : form.type === "dialect"
                                  ? "Optional Dialect API URL"
                                : "Optional Jupiter base URL"
                      }
                    />
                  </Field>
                )}
              </>
            )}

            {(formError || createCredential.error || updateCredential.error) && (
              <p className="rounded-[10px] border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-[12.5px] text-red-300" role="alert">
                {formError ?? createCredential.error?.message ?? updateCredential.error?.message}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </AppShell>
  );
}
