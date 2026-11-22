"use client";

// Settings — CLI tokens: list, create (shown once), revoke.

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, Loader2, Plus, Terminal, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Dialog, EmptyPanel, Field, PageHeader, SkeletonRows, btnGhost, btnPrimary, iconBtn, iconBtnDanger, inputClass, panel, rowClass } from "@/components/ui-kit/cloud-ui";
import { KeysMini } from "@/components/ui-kit/cloud-minis";
import {
  CliTokenError,
  TOKEN_EXPIRY_OPTIONS,
  cliLoginCommand,
  createCliToken,
  listCliTokens,
  revokeCliToken,
  type CliTokenRow,
  type CreatedCliToken,
} from "./cli-tokens-client";

function formatDate(value: string | null, fallback: string): string {
  return value ? new Date(value).toLocaleDateString() : fallback;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={iconBtn}
      title={label}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked; the text is selectable */ }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

export default function SettingsPage() {
  const [tokens, setTokens] = useState<CliTokenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [form, setForm] = useState<{ name: string; days: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<CreatedCliToken | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<CliTokenRow | null>(null);
  const endpoint = typeof window !== "undefined" ? window.location.origin : "https://cloud.solstudio.fun";

  const load = useCallback(async () => {
    try {
      setTokens(await listCliTokens());
      setError(null);
    } catch (err) {
      if (err instanceof CliTokenError && err.status === 401) setSignedOut(true);
      else setError(err instanceof Error ? err.message : "Failed to load tokens");
      setTokens([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!form) return;
    setPending(true);
    try {
      const result = await createCliToken(form.name, form.days);
      setForm(null);
      setCreated(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setPending(false);
    }
  };

  const revoke = async (row: CliTokenRow) => {
    setRevoking(row.id);
    try {
      await revokeCliToken(row.id);
      setConfirmRevoke(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke token");
    } finally {
      setRevoking(null);
    }
  };

  const newTokenButton = (
    <button type="button" onClick={() => setForm({ name: "", days: 90 })} className={btnPrimary} disabled={signedOut}>
      <Plus className="h-3.5 w-3.5" aria-hidden />
      New CLI token
    </button>
  );

  return (
    <AppShell>
      <PageHeader
        title="CLI tokens"
        description={
          <span className="inline-flex items-center gap-1.5">
            <Terminal className="h-3 w-3" aria-hidden />
            Tokens let the <code className="font-mono">solstudio cloud</code> CLI act as you. They are stored hashed and shown once.
          </span>
        }
        actions={newTokenButton}
      />

      {error && (
        <p className="mb-3 rounded-[10px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300" role="alert">
          {error}
        </p>
      )}

      {signedOut ? (
        <div className={`${panel} p-6 text-[13px] text-muted-foreground`}>
          <Link href="/auth/signin?callbackUrl=/settings" className="text-foreground underline">Sign in</Link> to manage CLI tokens.
        </div>
      ) : tokens === null ? (
        <SkeletonRows rows={3} />
      ) : tokens.length ? (
        <div className={panel}>
          <div className="hidden h-9 grid-cols-[minmax(0,1fr)_110px_110px_110px_40px] items-center gap-4 border-b border-white/[0.07] px-4 text-[12px] text-muted-foreground md:grid">
            <span>Name</span>
            <span>Created</span>
            <span>Last used</span>
            <span>Expires</span>
            <span />
          </div>
          {tokens.map((row) => (
            <div
              key={row.id}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_110px_110px_110px_40px] md:gap-4 ${rowClass}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-white/[0.07] bg-background text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{row.name || "CLI token"}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground md:hidden">
                    Created {formatDate(row.createdAt, "")} · Used {formatDate(row.lastUsedAt, "never")} · Expires {formatDate(row.expiresAt, "never")}
                  </p>
                </div>
              </div>
              <span className="hidden text-[12.5px] tabular-nums text-muted-foreground md:block">{formatDate(row.createdAt, "")}</span>
              <span className="hidden text-[12.5px] tabular-nums text-muted-foreground md:block">{formatDate(row.lastUsedAt, "Never")}</span>
              <span className="hidden text-[12.5px] tabular-nums text-muted-foreground md:block">{formatDate(row.expiresAt, "Never")}</span>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmRevoke(row)}
                  disabled={revoking === row.id}
                  className={iconBtnDanger}
                  title="Revoke token"
                  aria-label={`Revoke ${row.name || "CLI token"}`}
                >
                  {revoking === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel
          title="No CLI tokens yet"
          body="Create a token, then run solstudio cloud login on your machine or in CI."
          art={<KeysMini />}
          actions={newTokenButton}
        />
      )}

      {form && (
        <Dialog
          title="New CLI token"
          description="The token is shown once after you create it."
          onClose={() => setForm(null)}
          footer={
            <>
              <button type="button" onClick={() => setForm(null)} className={btnGhost}>Cancel</button>
              <button type="button" onClick={create} disabled={pending} className={btnPrimary}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Create token
              </button>
            </>
          }
        >
          <div className="space-y-3.5">
            <Field label="Name" htmlFor="token-name">
              <input
                id="token-name"
                className={inputClass}
                value={form.name}
                maxLength={100}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Laptop, CI, agent..."
                autoComplete="off"
                autoFocus
              />
            </Field>
            <Field label="Expires" htmlFor="token-expiry">
              <select
                id="token-expiry"
                className={inputClass}
                value={form.days}
                onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
              >
                {TOKEN_EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.days} value={opt.days}>{opt.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </Dialog>
      )}

      {created && (
        <Dialog
          title="Copy your token now"
          description="You won't be able to see it again. Treat it like a password."
          onClose={() => setCreated(null)}
          width="max-w-lg"
          footer={<button type="button" onClick={() => setCreated(null)} className={btnPrimary}>Done</button>}
        >
          <div className="space-y-3.5">
            <Field label="Token" htmlFor="token-value">
              <div className="flex items-center gap-1.5">
                <input id="token-value" readOnly className={`${inputClass} font-mono`} value={created.token} onFocus={(e) => e.currentTarget.select()} />
                <CopyButton text={created.token} label="Copy token" />
              </div>
            </Field>
            <Field label="Log in from your terminal" htmlFor="token-cmd">
              <div className="flex items-center gap-1.5">
                <input id="token-cmd" readOnly className={`${inputClass} font-mono`} value={cliLoginCommand(endpoint, created.token)} onFocus={(e) => e.currentTarget.select()} />
                <CopyButton text={cliLoginCommand(endpoint, created.token)} label="Copy login command" />
              </div>
            </Field>
          </div>
        </Dialog>
      )}

      {confirmRevoke && (
        <Dialog
          title="Revoke token?"
          description={`"${confirmRevoke.name || "CLI token"}" stops working immediately for every CLI or CI job using it.`}
          onClose={() => setConfirmRevoke(null)}
          footer={
            <>
              <button type="button" onClick={() => setConfirmRevoke(null)} className={btnGhost}>Cancel</button>
              <button type="button" onClick={() => revoke(confirmRevoke)} disabled={revoking !== null} className={btnPrimary}>
                {revoking && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Revoke
              </button>
            </>
          }
        >
          <p className="text-[12.5px] text-muted-foreground">Create a new token afterwards if you still need CLI access.</p>
        </Dialog>
      )}
    </AppShell>
  );
}
