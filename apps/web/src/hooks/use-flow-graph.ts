"use client";

import { useFlowStore } from "@/store/flow-store";
import type { Node, Edge } from "@xyflow/react";
import type { AccountType } from "@solflow/flow-nodes";
import type { StateField } from "@solflow/flow-nodes";
import type { EventField } from "@solflow/flow-nodes";

interface SiblingAccount {
  id: string;
  name: string;
  accountType: AccountType;
}

interface LinkedState {
  id: string;
  name: string;
  fields: StateField[];
}

interface FlowError {
  id: string;
  name: string;
  code: number;
  message: string;
}

interface FlowEvent {
  id: string;
  name: string;
  fields: EventField[];
}

interface InstructionArg {
  name: string;
  type: unknown;
}

export function useFlowGraph() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);

  function getSiblingAccounts(nodeId: string): SiblingAccount[] {
    const instruction = getParentInstruction(nodeId);
    if (!instruction) return [];

    const accountIds = edges
      .filter((e) => e.source === instruction.id && e.target !== nodeId)
      .map((e) => e.target);

    return nodes
      .filter((n) => accountIds.includes(n.id) && n.type === "account")
      .map((n) => {
        const d = n.data as Record<string, unknown>;
        return {
          id: n.id,
          name: (d.name as string) ?? "account",
          accountType: (d.accountType as AccountType) ?? "account",
        };
      });
  }

  function getAllSiblingAccounts(nodeId: string): SiblingAccount[] {
    const instruction = getParentInstruction(nodeId);
    if (!instruction) return [];

    const accountIds = edges
      .filter((e) => e.source === instruction.id)
      .map((e) => e.target);

    return nodes
      .filter((n) => accountIds.includes(n.id) && n.type === "account")
      .map((n) => {
        const d = n.data as Record<string, unknown>;
        return {
          id: n.id,
          name: (d.name as string) ?? "account",
          accountType: (d.accountType as AccountType) ?? "account",
        };
      });
  }

  function getLinkedState(accountNodeId: string): LinkedState | null {
    const stateEdge = edges.find(
      (e) =>
        (e.source === accountNodeId && nodes.find((n) => n.id === e.target)?.type === "state") ||
        (e.target === accountNodeId && nodes.find((n) => n.id === e.source)?.type === "state"),
    );

    if (!stateEdge) return null;

    const stateNodeId = nodes.find((n) => n.id === stateEdge.target)?.type === "state"
      ? stateEdge.target
      : stateEdge.source;

    const stateNode = nodes.find((n) => n.id === stateNodeId);
    if (!stateNode) return null;

    const d = stateNode.data as Record<string, unknown>;
    return {
      id: stateNode.id,
      name: (d.name as string) ?? "State",
      fields: (d.fields as StateField[]) ?? [],
    };
  }

  function getAllStates(): Array<{ id: string; name: string }> {
    return nodes
      .filter((n) => n.type === "state")
      .map((n) => {
        const d = n.data as Record<string, unknown>;
        return { id: n.id, name: (d.name as string) ?? "State" };
      });
  }

  function getAllErrors(): FlowError[] {
    return nodes
      .filter((n) => n.type === "error")
      .map((n) => {
        const d = n.data as Record<string, unknown>;
        return {
          id: n.id,
          name: (d.name as string) ?? "Error",
          code: (d.code as number) ?? 6000,
          message: (d.message as string) ?? "",
        };
      });
  }

  function getAllEvents(): FlowEvent[] {
    return nodes
      .filter((n) => n.type === "event")
      .map((n) => {
        const d = n.data as Record<string, unknown>;
        return {
          id: n.id,
          name: (d.name as string) ?? "Event",
          fields: (d.fields as EventField[]) ?? [],
        };
      });
  }

  function getParentInstruction(nodeId: string): Node | null {
    const directInstruction = findParentOfType(nodeId, "instruction");
    if (directInstruction) return directInstruction;

    const parentAccount = findParentOfType(nodeId, "account");
    if (parentAccount) return findParentOfType(parentAccount.id, "instruction");

    const parentLogic = findParentOfType(nodeId, "logic");
    if (parentLogic) return getParentInstruction(parentLogic.id);

    return null;
  }

  function getInstructionArgs(nodeId: string): InstructionArg[] {
    const instruction = getParentInstruction(nodeId);
    if (!instruction) return [];

    const d = instruction.data as Record<string, unknown>;
    const args = (d.instructionData as InstructionArg[]) ?? (d.args as InstructionArg[]) ?? [];
    return args;
  }

  function findParentOfType(nodeId: string, parentType: string): Node | null {
    const parentIds = edges
      .filter((e) => e.target === nodeId)
      .map((e) => e.source);

    const parentNode = nodes.find((n) => parentIds.includes(n.id) && n.type === parentType);
    return parentNode ?? null;
  }

  return {
    getSiblingAccounts,
    getAllSiblingAccounts,
    getLinkedState,
    getAllStates,
    getAllErrors,
    getAllEvents,
    getParentInstruction,
    getInstructionArgs,
  };
}
