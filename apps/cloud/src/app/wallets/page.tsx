"use client";

// Wallets Page.

import React, { useState } from "react";
import Link from "next/link";
import { Wallet, Plus, Trash2, Copy, Shield, ExternalLink } from "lucide-react";

const MOCK_WALLETS = [
  {
    id: "w1",
    label: "Main Wallet",
    publicKey: "DRpbCBMxVnDK7ma5sW...3kFj",
    network: "devnet",
    lastUsedAt: "2 hours ago",
  },
];

export default function WalletsPage() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-bold tracking-tight">
              SolStudio <span className="text-primary">Cloud</span>
            </Link>
            <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
              <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
              <Link href="/workflows" className="hover:text-foreground transition-colors">Workflows</Link>
              <Link href="/wallets" className="text-foreground font-medium">Wallets</Link>
              <Link href="/executions" className="hover:text-foreground transition-colors">Executions</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6">
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

        {/* Wallet List */}
        <div className="space-y-2">
          {MOCK_WALLETS.map((wallet) => (
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
                      {wallet.publicKey}
                    </code>
                    <button
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
                  Last used {wallet.lastUsedAt}
                </span>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-md text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  title="Delete wallet"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

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
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Network
                  </label>
                  <select className="w-full rounded-md border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                    <option value="devnet">Devnet</option>
                    <option value="mainnet">Mainnet</option>
                  </select>
                </div>
                <p className="text-[10px] text-muted-foreground/60">
                  A new keypair will be generated and encrypted server-side. The private key will never be exposed.
                </p>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Create Wallet
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
