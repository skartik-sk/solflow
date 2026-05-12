// @solflow/cloud-nodes — public API

// Types
export * from "./types";

// Registry
export { CloudNodeRegistry, cloudNodeRegistry } from "./registry";

// Components
export { CloudBaseNode } from "./components/cloud-base-node";
export type { CloudBaseNodeProps } from "./components/cloud-base-node";

// Icons
export { getIconByName } from "./icons";

// Connection validation
export { isValidCloudConnection, canNodeHaveInputs } from "./connection-rules";
export { assessCloudSafetyPolicy, assertWalletSafety } from "./security/safety";
export type { CloudSafetyPolicyAssessment } from "./security/safety";

// Node definitions
export { ManualTriggerNode, manualTriggerDef } from "./nodes/trigger-manual";
export { PriceFetchNode, priceFetchDef } from "./nodes/action-price-fetch";
export { FilterNode, filterDef } from "./nodes/transform-filter";
export { IfElseNode, ifElseDef } from "./nodes/logic-if-else";
export {
  JupiterSwapNode,
  jupiterPortfolioDef,
  jupiterPriceDef,
  jupiterRecentTokensDef,
  jupiterSwapBuildDef,
  jupiterSwapDef,
  jupiterSwapExecuteDef,
  jupiterSwapOrderDef,
  jupiterTokenCategoryDef,
  jupiterTokenSearchDef,
  jupiterTokenTagDef,
} from "./nodes/action-jupiter-swap";
export {
  TokenTransferNode,
  tokenTransferDef,
} from "./nodes/action-token-transfer";
export { CronTriggerNode, cronTriggerDef } from "./nodes/trigger-cron";
export { WebhookTriggerNode, webhookTriggerDef } from "./nodes/trigger-webhook";
export { AiAgentNode, aiAgentDef } from "./nodes/action-ai-agent";
export { WaitNode, waitDef } from "./nodes/logic-wait";
export { WebhookOutputNode, webhookOutputDef } from "./nodes/output-webhook";
export {
  OutputDisplayNode,
  outputDisplayDef,
  outputLogDef,
  outputResultDef,
} from "./nodes/output-display";
export {
  HeliusRpcNode,
  MetaplexAssetNode,
  OraclePriceNode,
  SquadsProposalNode,
  TokenAccountQueryNode,
  heliusAddressTransactionsDef,
  heliusParseTransactionDef,
  heliusRpcDef,
  heliusTransactionDef,
  heliusWalletActivityDef,
  metaplexAssetProofDef,
  metaplexAssetDef,
  metaplexAssetsByAuthorityDef,
  metaplexAssetsByCreatorDef,
  metaplexAssetsByGroupDef,
  metaplexAssetsByOwnerDef,
  metaplexGetAssetDef,
  metaplexSearchAssetsDef,
  oraclePriceDef,
  pythFeedSearchDef,
  pythLatestPricesDef,
  pythPriceDef,
  squadsProposalDef,
  switchboardPriceDef,
  tokenAccountQueryDef,
} from "./nodes/action-integration-pack";
export {
  UmbraNode,
  umbraIndexerHealthDef,
  umbraRelayerInfoDef,
  umbraTransferDef,
} from "./nodes/action-umbra";
export { SolanaRpcNode, solanaRpcDef } from "./nodes/action-solana-rpc";
export { CustomApiNode, customApiDef } from "./nodes/action-custom-api";
export {
  HeliusWebhookNode,
  heliusWebhookCreateDef,
  heliusWebhookDeleteDef,
  heliusWebhookListDef,
} from "./nodes/action-helius-webhook";
export {
  JitoNode,
  jitoBundleStatusDef,
  jitoSendBundleDef,
  jitoTipAccountsDef,
  jitoTipFloorDef,
} from "./nodes/action-jito";
export {
  NotificationNode,
  dialectAlertDef,
  discordMessageDef,
  telegramMessageDef,
} from "./nodes/action-notification";

// ─── Register all built-in nodes ───────────────────────────────────────────

import { cloudNodeRegistry } from "./registry";
import { manualTriggerDef } from "./nodes/trigger-manual";
import { priceFetchDef } from "./nodes/action-price-fetch";
import { filterDef } from "./nodes/transform-filter";
import { ifElseDef } from "./nodes/logic-if-else";
import {
  jupiterPortfolioDef,
  jupiterPriceDef,
  jupiterRecentTokensDef,
  jupiterSwapBuildDef,
  jupiterSwapDef,
  jupiterSwapExecuteDef,
  jupiterSwapOrderDef,
  jupiterTokenCategoryDef,
  jupiterTokenSearchDef,
  jupiterTokenTagDef,
} from "./nodes/action-jupiter-swap";
import { tokenTransferDef } from "./nodes/action-token-transfer";
import { cronTriggerDef } from "./nodes/trigger-cron";
import { webhookTriggerDef } from "./nodes/trigger-webhook";
import { aiAgentDef } from "./nodes/action-ai-agent";
import { waitDef } from "./nodes/logic-wait";
import { webhookOutputDef } from "./nodes/output-webhook";
import {
  outputDisplayDef,
  outputLogDef,
  outputResultDef,
} from "./nodes/output-display";
import {
  heliusRpcDef,
  heliusAddressTransactionsDef,
  heliusParseTransactionDef,
  heliusTransactionDef,
  heliusWalletActivityDef,
  metaplexAssetProofDef,
  metaplexAssetDef,
  metaplexAssetsByAuthorityDef,
  metaplexAssetsByCreatorDef,
  metaplexAssetsByGroupDef,
  metaplexAssetsByOwnerDef,
  metaplexGetAssetDef,
  metaplexSearchAssetsDef,
  oraclePriceDef,
  pythFeedSearchDef,
  pythLatestPricesDef,
  pythPriceDef,
  squadsProposalDef,
  switchboardPriceDef,
  tokenAccountQueryDef,
} from "./nodes/action-integration-pack";
import {
  umbraIndexerHealthDef,
  umbraRelayerInfoDef,
  umbraTransferDef,
} from "./nodes/action-umbra";
import { solanaRpcDef } from "./nodes/action-solana-rpc";
import { customApiDef } from "./nodes/action-custom-api";
import {
  heliusWebhookCreateDef,
  heliusWebhookDeleteDef,
  heliusWebhookListDef,
} from "./nodes/action-helius-webhook";
import {
  jitoBundleStatusDef,
  jitoSendBundleDef,
  jitoTipAccountsDef,
  jitoTipFloorDef,
} from "./nodes/action-jito";
import {
  dialectAlertDef,
  discordMessageDef,
  telegramMessageDef,
} from "./nodes/action-notification";

export function registerBuiltinNodes(): void {
  cloudNodeRegistry.register(manualTriggerDef);
  cloudNodeRegistry.register(priceFetchDef);
  cloudNodeRegistry.register(filterDef);
  cloudNodeRegistry.register(ifElseDef);
  cloudNodeRegistry.register(jupiterPriceDef);
  cloudNodeRegistry.register(jupiterTokenSearchDef);
  cloudNodeRegistry.register(jupiterTokenTagDef);
  cloudNodeRegistry.register(jupiterTokenCategoryDef);
  cloudNodeRegistry.register(jupiterRecentTokensDef);
  cloudNodeRegistry.register(jupiterPortfolioDef);
  cloudNodeRegistry.register(jupiterSwapOrderDef);
  cloudNodeRegistry.register(jupiterSwapBuildDef);
  cloudNodeRegistry.register(jupiterSwapExecuteDef);
  cloudNodeRegistry.register(jupiterSwapDef);
  cloudNodeRegistry.register(tokenTransferDef);
  cloudNodeRegistry.register(cronTriggerDef);
  cloudNodeRegistry.register(webhookTriggerDef);
  cloudNodeRegistry.register(aiAgentDef);
  cloudNodeRegistry.register(waitDef);
  cloudNodeRegistry.register(webhookOutputDef);
  cloudNodeRegistry.register(outputDisplayDef);
  cloudNodeRegistry.register(outputLogDef);
  cloudNodeRegistry.register(outputResultDef);
  cloudNodeRegistry.register(pythPriceDef);
  cloudNodeRegistry.register(pythFeedSearchDef);
  cloudNodeRegistry.register(pythLatestPricesDef);
  cloudNodeRegistry.register(switchboardPriceDef);
  cloudNodeRegistry.register(oraclePriceDef);
  cloudNodeRegistry.register(heliusWalletActivityDef);
  cloudNodeRegistry.register(heliusTransactionDef);
  cloudNodeRegistry.register(heliusParseTransactionDef);
  cloudNodeRegistry.register(heliusAddressTransactionsDef);
  cloudNodeRegistry.register(heliusRpcDef);
  cloudNodeRegistry.register(tokenAccountQueryDef);
  cloudNodeRegistry.register(metaplexGetAssetDef);
  cloudNodeRegistry.register(metaplexAssetProofDef);
  cloudNodeRegistry.register(metaplexAssetsByOwnerDef);
  cloudNodeRegistry.register(metaplexAssetsByGroupDef);
  cloudNodeRegistry.register(metaplexAssetsByCreatorDef);
  cloudNodeRegistry.register(metaplexAssetsByAuthorityDef);
  cloudNodeRegistry.register(metaplexSearchAssetsDef);
  cloudNodeRegistry.register(metaplexAssetDef);
  cloudNodeRegistry.register(squadsProposalDef);
  cloudNodeRegistry.register(umbraIndexerHealthDef);
  cloudNodeRegistry.register(umbraRelayerInfoDef);
  cloudNodeRegistry.register(umbraTransferDef);
  cloudNodeRegistry.register(solanaRpcDef);
  cloudNodeRegistry.register(customApiDef);
  cloudNodeRegistry.register(heliusWebhookCreateDef);
  cloudNodeRegistry.register(heliusWebhookListDef);
  cloudNodeRegistry.register(heliusWebhookDeleteDef);
  cloudNodeRegistry.register(jitoTipAccountsDef);
  cloudNodeRegistry.register(jitoBundleStatusDef);
  cloudNodeRegistry.register(jitoSendBundleDef);
  cloudNodeRegistry.register(jitoTipFloorDef);
  cloudNodeRegistry.register(discordMessageDef);
  cloudNodeRegistry.register(telegramMessageDef);
  cloudNodeRegistry.register(dialectAlertDef);
}

// ─── nodeTypes map (pass to <ReactFlow nodeTypes={nodeTypes}>) ─────────────

import { ManualTriggerNode } from "./nodes/trigger-manual";
import { PriceFetchNode } from "./nodes/action-price-fetch";
import { FilterNode } from "./nodes/transform-filter";
import { IfElseNode } from "./nodes/logic-if-else";
import { JupiterSwapNode } from "./nodes/action-jupiter-swap";
import { TokenTransferNode } from "./nodes/action-token-transfer";
import { CronTriggerNode } from "./nodes/trigger-cron";
import { WebhookTriggerNode } from "./nodes/trigger-webhook";
import { AiAgentNode } from "./nodes/action-ai-agent";
import { WaitNode } from "./nodes/logic-wait";
import { WebhookOutputNode } from "./nodes/output-webhook";
import { OutputDisplayNode } from "./nodes/output-display";
import {
  HeliusRpcNode,
  MetaplexAssetNode,
  OraclePriceNode,
  SquadsProposalNode,
  TokenAccountQueryNode,
} from "./nodes/action-integration-pack";
import { UmbraNode } from "./nodes/action-umbra";
import { SolanaRpcNode } from "./nodes/action-solana-rpc";
import { CustomApiNode } from "./nodes/action-custom-api";
import { HeliusWebhookNode } from "./nodes/action-helius-webhook";
import { JitoNode } from "./nodes/action-jito";
import { NotificationNode } from "./nodes/action-notification";

export const cloudNodeTypes = {
  "trigger:manual": ManualTriggerNode,
  "trigger:cron": CronTriggerNode,
  "trigger:webhook": WebhookTriggerNode,
  "action:price-fetch": PriceFetchNode,
  "action:jupiter-price": JupiterSwapNode,
  "action:jupiter-token-search": JupiterSwapNode,
  "action:jupiter-token-tag": JupiterSwapNode,
  "action:jupiter-token-category": JupiterSwapNode,
  "action:jupiter-recent-tokens": JupiterSwapNode,
  "action:jupiter-portfolio": JupiterSwapNode,
  "action:jupiter-swap-order": JupiterSwapNode,
  "action:jupiter-swap-build": JupiterSwapNode,
  "action:jupiter-swap-execute": JupiterSwapNode,
  "action:jupiter-swap": JupiterSwapNode,
  "action:token-transfer": TokenTransferNode,
  "action:ai-agent": AiAgentNode,
  "action:pyth-price": OraclePriceNode,
  "action:pyth-feed-search": OraclePriceNode,
  "action:pyth-latest-prices": OraclePriceNode,
  "action:switchboard-price": OraclePriceNode,
  "action:oracle-price": OraclePriceNode,
  "action:helius-wallet-activity": HeliusRpcNode,
  "action:helius-transaction": HeliusRpcNode,
  "action:helius-parse-transaction": HeliusRpcNode,
  "action:helius-address-transactions": HeliusRpcNode,
  "action:helius-rpc": HeliusRpcNode,
  "action:token-account-query": TokenAccountQueryNode,
  "action:metaplex-get-asset": MetaplexAssetNode,
  "action:metaplex-asset-proof": MetaplexAssetNode,
  "action:metaplex-assets-by-owner": MetaplexAssetNode,
  "action:metaplex-assets-by-group": MetaplexAssetNode,
  "action:metaplex-assets-by-creator": MetaplexAssetNode,
  "action:metaplex-assets-by-authority": MetaplexAssetNode,
  "action:metaplex-search-assets": MetaplexAssetNode,
  "action:metaplex-asset": MetaplexAssetNode,
  "action:squads-proposal": SquadsProposalNode,
  "action:umbra-indexer-health": UmbraNode,
  "action:umbra-relayer-info": UmbraNode,
  "action:umbra-transfer": UmbraNode,
  "action:solana-rpc": SolanaRpcNode,
  "action:custom-api": CustomApiNode,
  "action:helius-webhook-create": HeliusWebhookNode,
  "action:helius-webhook-list": HeliusWebhookNode,
  "action:helius-webhook-delete": HeliusWebhookNode,
  "action:jito-tip-accounts": JitoNode,
  "action:jito-bundle-status": JitoNode,
  "action:jito-send-bundle": JitoNode,
  "action:jito-tip-floor": JitoNode,
  "action:discord-message": NotificationNode,
  "action:telegram-message": NotificationNode,
  "action:dialect-alert": NotificationNode,
  "transform:filter": FilterNode,
  "logic:if-else": IfElseNode,
  "logic:wait": WaitNode,
  "output:webhook": WebhookOutputNode,
  "output:display": OutputDisplayNode,
  "output:log": OutputDisplayNode,
  "output:result": OutputDisplayNode,
} as const;
