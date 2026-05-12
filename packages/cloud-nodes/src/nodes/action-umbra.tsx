// Umbra Privacy nodes — protocol planning and service checks.

import React, { memo } from "react";
import { ShieldCheck } from "lucide-react";
import type { CloudFlowNodeData, CloudNodeDefinition, WorkflowItem } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl, redactUrlSecrets } from "../security/outbound-url";

const UMBRA_PROGRAM_IDS: Record<UmbraNetwork, string> = {
  mainnet: "UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh",
  devnet: "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ",
};

const UMBRA_INDEXER_ENDPOINTS: Record<UmbraNetwork, string> = {
  mainnet: "https://utxo-indexer.api.umbraprivacy.com",
  devnet: "https://utxo-indexer.api-devnet.umbraprivacy.com",
};

const UMBRA_RELAYER_ENDPOINTS: Record<UmbraNetwork, string> = {
  mainnet: "https://relayer.api.umbraprivacy.com",
  devnet: "https://relayer.api-devnet.umbraprivacy.com",
};

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const UMBRA_MINT = "PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta";

type UmbraNetwork = "mainnet" | "devnet";

function networkParam(value: unknown): UmbraNetwork {
  return value === "devnet" ? "devnet" : "mainnet";
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(params: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(params, key);
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function baseUnitAmount(params: Record<string, unknown>): string {
  const raw = params.amountBaseUnits;
  const value =
    typeof raw === "number" && Number.isFinite(raw)
      ? String(Math.trunc(raw))
      : typeof raw === "bigint"
        ? raw.toString()
        : typeof raw === "string"
          ? raw.trim()
          : "";
  if (!/^[0-9]+$/.test(value) || BigInt(value) <= BigInt(0)) {
    throw new Error("Amount must be a positive integer in token base units");
  }
  return value;
}

function endpointFor(
  params: Record<string, unknown>,
  key: "indexerEndpoint" | "relayerEndpoint",
  defaults: Record<UmbraNetwork, string>,
  network: UmbraNetwork,
): string {
  return optionalString(params, key) ?? defaults[network];
}

function endpointUrl(baseUrl: string, path: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ""), normalizedBase);
  return assertSafeOutboundUrl(url.toString(), { allowHttp: false });
}

function requireFetch(): typeof fetch {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this runtime");
  }
  return fetch;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchUmbraJson(baseUrl: string, path: string, signal: AbortSignal): Promise<unknown> {
  const url = endpointUrl(baseUrl, path);
  const response = await requireFetch()(url.toString(), {
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = await readBody(response);
  if (!response.ok) {
    throw new Error(`Umbra API error ${response.status} ${response.statusText}: ${String(payload).slice(0, 500)}`);
  }
  return payload;
}

function inputItems(ctx: Parameters<NonNullable<CloudNodeDefinition["execute"]>>[0]): WorkflowItem[] {
  return ctx.inputs?.[0] ?? [{ json: {} }];
}

function attachUmbraOutput(
  items: WorkflowItem[],
  key: "umbraTransfer" | "umbraIndexer" | "umbraRelayer",
  value: Record<string, unknown>,
): WorkflowItem[] {
  return items.map((item) => ({
    ...item,
    json: {
      ...item.json,
      [key]: value,
    },
  }));
}

function UmbraCard({
  data,
  selected,
  meta,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
  meta: string;
}) {
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground/70">
          <ShieldCheck size={12} />
        </span>
        <span className="max-w-[120px] truncate text-right font-mono text-[10px]">
          {meta}
        </span>
      </div>
    </CloudBaseNode>
  );
}

export const UmbraNode = memo(function UmbraNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const nodeData = data.data ?? {};
  const network = String(nodeData.network ?? "mainnet");
  const meta =
    data.type === "action:umbra-indexer-health"
      ? `${network}:indexer`
      : data.type === "action:umbra-relayer-info"
        ? `${network}:relayer`
        : `${network}:${String(nodeData.mint ?? USDC_MINT).slice(0, 4)}`;
  return <UmbraCard data={data} selected={selected} meta={meta} />;
});

export const umbraIndexerHealthDef: CloudNodeDefinition = {
  type: "action:umbra-indexer-health",
  label: "Umbra Indexer Health",
  category: "action",
  description: "Check the Umbra UTXO indexer health endpoint for mainnet or devnet.",
  icon: "ShieldCheck",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "network",
      label: "Network",
      type: "select",
      required: true,
      default: "mainnet",
      options: [
        { label: "Mainnet", value: "mainnet" },
        { label: "Devnet", value: "devnet" },
      ],
    },
    {
      key: "indexerEndpoint",
      label: "Indexer Endpoint",
      type: "text",
      required: false,
      description: "Optional override. Defaults to the Umbra public indexer for the selected network.",
      supportsExpressions: true,
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "health" }],
  defaultData: { network: "mainnet", indexerEndpoint: "" },
  component: UmbraNode,
  async execute(ctx) {
    const network = networkParam(ctx.params.network);
    const endpoint = endpointFor(ctx.params, "indexerEndpoint", UMBRA_INDEXER_ENDPOINTS, network);
    const response = await fetchUmbraJson(endpoint, "/health", ctx.signal);
    return attachUmbraOutput(inputItems(ctx), "umbraIndexer", {
      provider: "umbra",
      operation: "indexer-health",
      network,
      endpoint: redactUrlSecrets(endpoint),
      response,
      checkedAt: new Date().toISOString(),
    });
  },
};

export const umbraRelayerInfoDef: CloudNodeDefinition = {
  type: "action:umbra-relayer-info",
  label: "Umbra Relayer Info",
  category: "action",
  description: "Read Umbra relayer identity, supported mints, and active stealth pool indices.",
  icon: "ShieldCheck",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "network",
      label: "Network",
      type: "select",
      required: true,
      default: "mainnet",
      options: [
        { label: "Mainnet", value: "mainnet" },
        { label: "Devnet", value: "devnet" },
      ],
    },
    {
      key: "relayerEndpoint",
      label: "Relayer Endpoint",
      type: "text",
      required: false,
      description: "Optional override. Defaults to the Umbra public relayer for the selected network.",
      supportsExpressions: true,
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "relayer" }],
  defaultData: { network: "mainnet", relayerEndpoint: "" },
  component: UmbraNode,
  async execute(ctx) {
    const network = networkParam(ctx.params.network);
    const endpoint = endpointFor(ctx.params, "relayerEndpoint", UMBRA_RELAYER_ENDPOINTS, network);
    const response = await fetchUmbraJson(endpoint, "/v1/relayer/info", ctx.signal);
    return attachUmbraOutput(inputItems(ctx), "umbraRelayer", {
      provider: "umbra",
      operation: "relayer-info",
      network,
      endpoint: redactUrlSecrets(endpoint),
      response,
      checkedAt: new Date().toISOString(),
    });
  },
};

export const umbraTransferDef: CloudNodeDefinition = {
  type: "action:umbra-transfer",
  label: "Umbra Transfer Plan",
  category: "action",
  description: "Prepare an Umbra private transfer handoff with wallet, ZK prover, indexer, and relayer requirements.",
  icon: "ShieldCheck",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "network",
      label: "Network",
      type: "select",
      required: true,
      default: "mainnet",
      options: [
        { label: "Mainnet", value: "mainnet" },
        { label: "Devnet", value: "devnet" },
      ],
    },
    {
      key: "transferMode",
      label: "Transfer Mode",
      type: "select",
      required: true,
      default: "public-to-receiver-utxo",
      options: [
        { label: "Public Balance -> Receiver UTXO", value: "public-to-receiver-utxo" },
        { label: "Encrypted Balance -> Receiver UTXO", value: "encrypted-to-receiver-utxo" },
        { label: "Encrypted Balance -> Public Balance", value: "encrypted-to-public-withdraw" },
      ],
    },
    {
      key: "senderWalletId",
      label: "Sender Wallet",
      type: "wallet-select",
      required: false,
      description: "Cloud wallet used for the eventual wallet-signing handoff.",
    },
    {
      key: "recipientAddress",
      label: "Recipient Address",
      type: "address",
      required: true,
      description: "Receiver Solana address for UTXO transfer or public withdrawal.",
      supportsExpressions: true,
    },
    {
      key: "mint",
      label: "Mint",
      type: "pubkey",
      required: true,
      default: USDC_MINT,
      description: "Supported Umbra mint. Mainnet supports USDC, USDT, wSOL, UMBRA, and relayer-advertised mints.",
      supportsExpressions: true,
    },
    {
      key: "amountBaseUnits",
      label: "Amount Base Units",
      type: "text",
      required: true,
      default: "1000000",
      description: "Integer amount in token base units, for example 1 USDC = 1000000.",
      supportsExpressions: true,
    },
    {
      key: "validateRelayer",
      label: "Validate Relayer",
      type: "boolean",
      required: false,
      default: true,
      description: "Fetch relayer info and warn if the configured mint is not advertised as supported.",
    },
    {
      key: "indexerEndpoint",
      label: "Indexer Endpoint",
      type: "text",
      required: false,
      supportsExpressions: true,
    },
    {
      key: "relayerEndpoint",
      label: "Relayer Endpoint",
      type: "text",
      required: false,
      supportsExpressions: true,
    },
    {
      key: "rpcUrl",
      label: "RPC URL",
      type: "text",
      required: false,
      supportsExpressions: true,
    },
    {
      key: "rpcSubscriptionsUrl",
      label: "RPC WebSocket URL",
      type: "text",
      required: false,
      supportsExpressions: true,
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "plan" }],
  defaultData: {
    network: "mainnet",
    transferMode: "public-to-receiver-utxo",
    senderWalletId: "",
    recipientAddress: "",
    mint: USDC_MINT,
    amountBaseUnits: "1000000",
    validateRelayer: true,
    indexerEndpoint: "",
    relayerEndpoint: "",
    rpcUrl: "",
    rpcSubscriptionsUrl: "",
  },
  component: UmbraNode,
  async execute(ctx) {
    const network = networkParam(ctx.params.network);
    const transferMode = requiredString(ctx.params, "transferMode", "Transfer Mode");
    const recipientAddress = requiredString(ctx.params, "recipientAddress", "Recipient Address");
    const mint = requiredString(ctx.params, "mint", "Mint");
    const amount = baseUnitAmount(ctx.params);
    const indexerEndpoint = endpointFor(ctx.params, "indexerEndpoint", UMBRA_INDEXER_ENDPOINTS, network);
    const relayerEndpoint = endpointFor(ctx.params, "relayerEndpoint", UMBRA_RELAYER_ENDPOINTS, network);
    const senderWalletId = optionalString(ctx.params, "senderWalletId");
    const senderPublicKey = senderWalletId ? await ctx.wallet.getPublicKey(senderWalletId) : null;

    let relayerInfo: unknown = null;
    const warnings = [
      "Umbra private transfer execution must happen through @umbra-privacy/sdk with a wallet signer and ZK prover.",
      "Do not send private keys or master viewing keys through workflow JSON.",
    ];

    if (ctx.params.validateRelayer !== false) {
      relayerInfo = await fetchUmbraJson(relayerEndpoint, "/v1/relayer/info", ctx.signal);
      const supportedMints =
        relayerInfo && typeof relayerInfo === "object" && "supported_mints" in relayerInfo
          ? (relayerInfo as { supported_mints?: unknown }).supported_mints
          : undefined;
      if (Array.isArray(supportedMints) && !supportedMints.includes(mint)) {
        warnings.push("Configured mint was not advertised by the selected Umbra relayer.");
      }
    }

    const transferPlan = {
      provider: "umbra",
      operation: "transfer-plan",
      network,
      programId: UMBRA_PROGRAM_IDS[network],
      sdkPackage: "@umbra-privacy/sdk",
      zkProverPackage: "@umbra-privacy/web-zk-prover",
      transferMode,
      senderWalletId: senderWalletId ?? null,
      senderPublicKey,
      recipientAddress,
      mint,
      amountBaseUnits: amount,
      indexerEndpoint: redactUrlSecrets(indexerEndpoint),
      relayerEndpoint: redactUrlSecrets(relayerEndpoint),
      rpcUrl: optionalString(ctx.params, "rpcUrl") ? redactUrlSecrets(optionalString(ctx.params, "rpcUrl")!) : null,
      rpcSubscriptionsUrl: optionalString(ctx.params, "rpcSubscriptionsUrl")
        ? redactUrlSecrets(optionalString(ctx.params, "rpcSubscriptionsUrl")!)
        : null,
      requiresWalletSignature: true,
      requiresZkProver: true,
      requiresRelayer: transferMode.includes("utxo"),
      requiresIndexer: true,
      relayerInfo,
      supportedMainnetMints: [USDC_MINT, USDT_MINT, WSOL_MINT, UMBRA_MINT],
      docs: {
        sdk: "https://sdk.umbraprivacy.com/reference/overview",
        indexer: "https://sdk.umbraprivacy.com/indexer/overview",
        relayer: "https://sdk.umbraprivacy.com/relayer/overview",
      },
      warnings,
      createdAt: new Date().toISOString(),
    };

    ctx.logger.info("Umbra transfer plan prepared", {
      network,
      transferMode,
      mint,
      amountBaseUnits: amount,
    });

    return attachUmbraOutput(inputItems(ctx), "umbraTransfer", transferPlan);
  },
};
