// Helpers for the deploy maintenance actions in the editor
// (reclaiming abandoned buffer SOL, resetting an unreadable deployer wallet).

import { normalizeNetwork, resolveRpcUrl } from "@/store/project-store";

/** Text the user must type to reset the deployer wallet. */
export const RESET_DEPLOYER_PHRASE = "RESET MY DEPLOYER WALLET";

export function isResetDeployerConfirmed(typed: string): boolean {
  return typed.trim() === RESET_DEPLOYER_PHRASE;
}

/** RPC URL for a deployment's network ("DEVNET" / "MAINNET" / "LOCALNET"). */
export function deployRpcUrl(network: string): string {
  return resolveRpcUrl(normalizeNetwork(network.toLowerCase()), []);
}

/** Buffer balance in SOL, or null when it can't be read. */
export async function bufferBalanceSol(
  network: string,
  buffer: string | null,
  getBalance: (rpcUrl: string, address: string) => Promise<number>,
): Promise<number | null> {
  if (!buffer) return null;
  try {
    return (await getBalance(deployRpcUrl(network), buffer)) / 1e9;
  } catch {
    return null;
  }
}

export function reclaimPrompt(sol: number | null, programId: string): string {
  const amount = sol === null ? "the SOL" : `about ${sol.toFixed(4)} SOL`;
  return `Close the abandoned deploy buffer for ${programId.slice(0, 8)}… and return ${amount} to your deployer wallet?`;
}
