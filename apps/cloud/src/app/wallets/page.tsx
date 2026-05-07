"use client";

// Wallets Page — manage encrypted cloud wallets.

import React, { useState } from "react";
import { Wallet, Plus, Trash2, Copy, Shield, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { AppShell } from "@/components/layout/AppShell";

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

  return (
    <AppShell>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold">Cloud Wallets</h1>
            <p className="text-xs text-muted-foreground">
              Encrypted wallets for automated transaction signing
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={13} />
            Create Wallet
          </button>
        </div>

        {/* Security notice */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 mb-6">
          <Shield className="shrink-0 text-blue-400 mt-0.5" size={16} />
          <div>
            <p className="text-xs font-medium text-blue-400">Encrypted & Secure</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Private keys are encrypted with AES-256-GCM using PBKDF2 key derivation.
              Keys never leave the server unencrypted.
            </p>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Wallet List */}
        {!isLoading && (
          <div className="space-y-2">
            {wallets && wallets.length > 0 ? wallets.map((wallet) => (
              <div
                key={wallet.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Wallet size={16} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{wallet.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-[11px] text-muted-foreground font-mono">
                        {wallet.publicKey.slice(0, 20)}...{wallet.publicKey.slice(-4)}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(wallet.publicKey)}
                        className="text-muted-foreground/40 hover:text-foreground"
                        title="Copy address"
                      >
                        <Copy size={10} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {wallet.network}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Created {new Date(wallet.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleDelete(wallet.id)}
                    disabled={deleteMutation.isPending}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-30"
                    title="Delete wallet"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Wallet className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No wallets yet</p>
                <p className="text-xs text-muted-foreground/60 mb-4">
                  Create a cloud wallet to start signing transactions
                </p>
              </div>
            )}
          </div>
        )}

        {/* Create Dialog */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
              <h2 className="text-sm font-bold mb-4">Create Cloud Wallet</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Label
                  </label>
                  <input
                    className="w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="My Wallet"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Network
                  </label>
                  <select
                    className="w-full rounded-md border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    value={network}
                    onChange={(e) => setNetwork(e.target.value)}
                  >
                    <option value="devnet">Devnet</option>
                    <option value="mainnet">Mainnet</option>
                  </select>
                </div>
                {createMutation.error && (
                  <p className="text-[11px] text-red-400">
                    {createMutation.error.message}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/60">
                  A new Ed25519 keypair will be generated and encrypted server-side with AES-256-GCM.
                </p>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => { setShowCreate(false); setLabel(""); }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!label.trim() || createMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                  Create Wallet
                </button>
              </div>
            </div>
          </div>
        )}
    </AppShell>
  );
}
