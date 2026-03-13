"use client";

// apps/web/src/components/providers/WalletProvider.tsx
// Wraps the app with Solana wallet adapter context (Phantom, Solflare, Backpack).

import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

// Import the default wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Supported wallets — kept minimal; wallet-standard wallets (Phantom, Solflare,
  // Backpack) register themselves automatically via the Wallet Standard protocol,
  // so we only need to explicitly add legacy adapters.
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <SolanaWalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
