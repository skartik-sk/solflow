"use client";

import type { ReactNode } from "react";
import { WalletProvider } from "./WalletProvider";

export function ClientWalletProvider({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
