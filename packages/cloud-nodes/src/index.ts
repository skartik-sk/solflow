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

// Node definitions
export { ManualTriggerNode, manualTriggerDef } from "./nodes/trigger-manual";
export { PriceFetchNode, priceFetchDef } from "./nodes/action-price-fetch";
export { FilterNode, filterDef } from "./nodes/transform-filter";
export { IfElseNode, ifElseDef } from "./nodes/logic-if-else";
export { JupiterSwapNode, jupiterSwapDef } from "./nodes/action-jupiter-swap";
export { TokenTransferNode, tokenTransferDef } from "./nodes/action-token-transfer";
export { CronTriggerNode, cronTriggerDef } from "./nodes/trigger-cron";
export { WebhookTriggerNode, webhookTriggerDef } from "./nodes/trigger-webhook";
export { AiAgentNode, aiAgentDef } from "./nodes/action-ai-agent";
export { WaitNode, waitDef } from "./nodes/logic-wait";
export { WebhookOutputNode, webhookOutputDef } from "./nodes/output-webhook";

// ─── Register all built-in nodes ───────────────────────────────────────────

import { cloudNodeRegistry } from "./registry";
import { manualTriggerDef } from "./nodes/trigger-manual";
import { priceFetchDef } from "./nodes/action-price-fetch";
import { filterDef } from "./nodes/transform-filter";
import { ifElseDef } from "./nodes/logic-if-else";
import { jupiterSwapDef } from "./nodes/action-jupiter-swap";
import { tokenTransferDef } from "./nodes/action-token-transfer";
import { cronTriggerDef } from "./nodes/trigger-cron";
import { webhookTriggerDef } from "./nodes/trigger-webhook";
import { aiAgentDef } from "./nodes/action-ai-agent";
import { waitDef } from "./nodes/logic-wait";
import { webhookOutputDef } from "./nodes/output-webhook";

export function registerBuiltinNodes(): void {
  cloudNodeRegistry.register(manualTriggerDef);
  cloudNodeRegistry.register(priceFetchDef);
  cloudNodeRegistry.register(filterDef);
  cloudNodeRegistry.register(ifElseDef);
  cloudNodeRegistry.register(jupiterSwapDef);
  cloudNodeRegistry.register(tokenTransferDef);
  cloudNodeRegistry.register(cronTriggerDef);
  cloudNodeRegistry.register(webhookTriggerDef);
  cloudNodeRegistry.register(aiAgentDef);
  cloudNodeRegistry.register(waitDef);
  cloudNodeRegistry.register(webhookOutputDef);
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

export const cloudNodeTypes = {
  "trigger:manual":     ManualTriggerNode,
  "trigger:cron":       CronTriggerNode,
  "trigger:webhook":    WebhookTriggerNode,
  "action:price-fetch": PriceFetchNode,
  "action:jupiter-swap": JupiterSwapNode,
  "action:token-transfer": TokenTransferNode,
  "action:ai-agent":    AiAgentNode,
  "transform:filter":   FilterNode,
  "logic:if-else":      IfElseNode,
  "logic:wait":         WaitNode,
  "output:webhook":     WebhookOutputNode,
} as const;
