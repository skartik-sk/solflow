// Connection validation rules for cloud workflow nodes.
// Prevents users from making invalid connections (e.g., trigger→trigger).

import type { ConnectionType } from "./types";

// Which connection types can connect to which
const VALID_CONNECTIONS: Record<ConnectionType, ConnectionType[]> = {
  main:    ["main"],
  ai:      ["ai", "main"],
  trigger: ["main"],
};

// Which categories can be targets of which source categories
const CATEGORY_RULES: Record<string, string[]> = {
  trigger:    ["action", "transform", "logic", "ai", "output"],
  action:     ["action", "transform", "logic", "ai", "output"],
  transform:  ["action", "transform", "logic", "ai", "output"],
  logic:      ["action", "transform", "logic", "ai", "output"],
  ai:         ["action", "transform", "logic", "ai", "output"],
  output:     [],
};

// Trigger nodes can only be sources (no inputs except webhook triggers)
const IS_SOURCE_ONLY = new Set(["trigger"]);

export function isValidCloudConnection(
  sourceCategory: string,
  targetCategory: string,
  sourcePortType: ConnectionType,
  targetPortType: ConnectionType,
): boolean {
  // Can't connect to self
  if (sourceCategory === targetCategory && sourcePortType === targetPortType) return false;

  // Check connection type compatibility
  const allowedTypes = VALID_CONNECTIONS[sourcePortType];
  if (!allowedTypes?.includes(targetPortType)) return false;

  // Check category compatibility
  const allowedCategories = CATEGORY_RULES[sourceCategory];
  if (!allowedCategories?.includes(targetCategory)) return false;

  // Output nodes can't have outgoing connections
  if (sourceCategory === "output") return false;

  return true;
}

export function canNodeHaveInputs(category: string): boolean {
  return !IS_SOURCE_ONLY.has(category);
}
