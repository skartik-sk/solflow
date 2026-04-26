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

// ─── Register all built-in nodes ───────────────────────────────────────────

import { cloudNodeRegistry } from "./registry";
import { manualTriggerDef } from "./nodes/trigger-manual";
import { priceFetchDef } from "./nodes/action-price-fetch";
import { filterDef } from "./nodes/transform-filter";
import { ifElseDef } from "./nodes/logic-if-else";
import { jupiterSwapDef } from "./nodes/action-jupiter-swap";
import { tokenTransferDef } from "./nodes/action-token-transfer";

export function registerBuiltinNodes(): void {
  cloudNodeRegistry.register(manualTriggerDef);
  cloudNodeRegistry.register(priceFetchDef);
  cloudNodeRegistry.register(filterDef);
  cloudNodeRegistry.register(ifElseDef);
  cloudNodeRegistry.register(jupiterSwapDef);
  cloudNodeRegistry.register(tokenTransferDef);
}

// ─── nodeTypes map (pass to <ReactFlow nodeTypes={nodeTypes}>) ─────────────

import { ManualTriggerNode } from "./nodes/trigger-manual";
import { PriceFetchNode } from "./nodes/action-price-fetch";
import { FilterNode } from "./nodes/transform-filter";
import { IfElseNode } from "./nodes/logic-if-else";
import { JupiterSwapNode } from "./nodes/action-jupiter-swap";
import { TokenTransferNode } from "./nodes/action-token-transfer";

export const cloudNodeTypes = {
  "trigger:manual":     ManualTriggerNode,
  "action:price-fetch": PriceFetchNode,
  "action:jupiter-swap": JupiterSwapNode,
  "action:token-transfer": TokenTransferNode,
  "transform:filter":   FilterNode,
  "logic:if-else":      IfElseNode,
} as const;
