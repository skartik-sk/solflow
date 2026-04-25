export interface DeFiAdapter {
  protocol: string;
  operations: string[];
  execute(
    operation: string,
    params: Record<string, unknown>,
    walletOps: unknown,
  ): Promise<unknown>;
}
