"use client";

// Wallets Page — manage encrypted cloud wallets.

import React, { useState } from "react";
import { Wallet, Plus, Trash2, Copy, Lock, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { AppShell } from "@/components/layout/AppShell";
import { Dialog, EmptyPanel, Field, PageHeader, SkeletonRows, btnGhost, btnPrimary, focusRing, iconBtnDanger, inputClass, panel, rowClass } from "@/components/ui-kit/cloud-ui";
import { WalletMini } from "@/components/ui-kit/cloud-minis";

export default function WalletsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [network, setNetwork] = useState("devnet");

  const utils = trpc.useUtils();
  const { data: wallets, isLoading } = trpc.wallet.list.useQuery();
  const createMutation = trpc.wallet.create.useMutation({
    onSuccess: () => {
      utils.wallet.list.invalidate();
      setShowCreate(false);
      setLabel("");
    },
  });
  const deleteMutation = trpc.wallet.delete.useMutation({
    onSuccess: () => {
      utils.wallet.list.invalidate();
    },
  });

  const handleCreate = () => {
    if (!label.trim()) return;
    createMutation.mutate({ label: label.trim(), network: network as "mainnet" | "devnet" });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this wallet? This cannot be undone.")) return;
    deleteMutation.mutate({ id });
  };

  const closeCreate = () => { setShowCreate(false); setLabel(""); };

  return (
    <AppShell>
      <PageHeader
        title="Cloud wallets"
        description="Encrypted wallets for automated transaction signing"
        actions={
          <button type="button" onClick={() => setShowCreate(true)} className={btnPrimary}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Create wallet
          </button>
        }
      />

      {/* Security notice */}
      <div className="mb-4 flex items-start gap-2.5 rounded-[12px] border border-white/[0.07] bg-card/60 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <p>
          <span className="font-medium text-foreground">Encrypted and server side.</span>{" "}
          Private keys are encrypted with AES-256-GCM using PBKDF2 key derivation. Keys never leave the server unencrypted.
        </p>
      </div>

      {/* Loading */}
      {isLoading && <SkeletonRows rows={3} />}

      {/* Wallet List */}
      {!isLoading && (wallets && wallets.length > 0 ? (
        <div className={panel}>
          <div className="hidden h-9 grid-cols-[minmax(0,1fr)_240px_84px_100px_40px] items-center gap-4 border-b border-white/[0.07] px-4 text-[12px] text-muted-foreground md:grid">
            <span>Label</span>
            <span>Public key</span>
            <span>Network</span>
            <span>Created</span>
            <span />
          </div>
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_240px_84px_100px_40px] md:gap-4 ${rowClass}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-white/[0.07] bg-background text-primary">
                  <Wallet className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{wallet.label}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground md:hidden">
                    <span className="font-mono">{wallet.publicKey.slice(0, 4)}…{wallet.publicKey.slice(-4)}</span> · {wallet.network}
                  </p>
                </div>
              </div>

              {/* Public key only; the private key is never sent to the browser */}
              <div className="hidden min-w-0 items-center gap-1 md:flex">
                <code className="truncate font-mono text-[12px] text-muted-foreground" title={wallet.publicKey}>
                  {wallet.publicKey.slice(0, 20)}...{wallet.publicKey.slice(-4)}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(wallet.publicKey)}
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground ${focusRing}`}
                  title="Copy address"
                  aria-label={`Copy ${wallet.label} address`}
                >
                  <Copy className="h-3 w-3" aria-hidden />
                </button>
              </div>

              <span className="hidden md:block">
                <span
                  className={`inline-flex h-6 items-center rounded-md border px-2 text-[11.5px] font-medium ${
                    wallet.network === "mainnet"
                      ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
                      : "border-white/[0.08] text-muted-foreground"
                  }`}
                >
                  {wallet.network}
                </span>
              </span>
              <span className="hidden text-[12.5px] tabular-nums text-muted-foreground md:block">
                {new Date(wallet.createdAt).toLocaleDateString()}
              </span>
              <div className="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(wallet.publicKey)}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden ${focusRing}`}
                  title="Copy address"
                  aria-label={`Copy ${wallet.label} address`}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(wallet.id)}
                  disabled={deleteMutation.isPending}
                  className={iconBtnDanger}
                  title="Delete wallet"
                  aria-label={`Delete ${wallet.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel
          title="No wallets yet"
          body="Create a cloud wallet to start signing transactions."
          art={<WalletMini />}
          actions={
            <button type="button" onClick={() => setShowCreate(true)} className={btnPrimary}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Create wallet
            </button>
          }
        />
      ))}

      {/* Create Dialog */}
      {showCreate && (
        <Dialog
          title="Create cloud wallet"
          description="A new Ed25519 keypair will be generated and encrypted server-side with AES-256-GCM."
          onClose={closeCreate}
          footer={
            <>
              <button type="button" onClick={closeCreate} className={btnGhost}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!label.trim() || createMutation.isPending}
                className={btnPrimary}
              >
                {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Create wallet
              </button>
            </>
          }
        >
          <div className="space-y-3.5">
            <Field label="Label" htmlFor="wallet-label">
              <input
                id="wallet-label"
                className={inputClass}
                placeholder="My Wallet"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </Field>
            <Field label="Network" htmlFor="wallet-network" hint={network === "mainnet" ? "Mainnet wallets sign real transactions with real funds." : undefined}>
              <select
                id="wallet-network"
                className={inputClass}
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
              >
                <option value="devnet">Devnet</option>
                <option value="mainnet">Mainnet</option>
              </select>
            </Field>
            {createMutation.error && (
              <p className="rounded-[10px] border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-[12.5px] text-red-300" role="alert">
                {createMutation.error.message}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </AppShell>
  );
}
