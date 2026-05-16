import { describe, expect, it } from "vitest";
import { cloudCommand, coerceWorkflowDefinition } from "../commands/cloud";

describe("cloud command", () => {
  it("registers cloud platform control subcommands", () => {
    expect(cloudCommand.name()).toBe("cloud");
    expect(cloudCommand.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining([
        "login",
        "whoami",
        "status",
        "workflow",
        "execution",
        "credential",
        "wallet",
        "nodes",
        "self-host",
        "agent",
      ]),
    );
  });

  it("registers self-host deploy and operation commands", () => {
    const selfHost = cloudCommand.commands.find((command) => command.name() === "self-host");

    expect(selfHost?.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(["init", "check", "deploy", "status", "logs"]),
    );
  });

  it("accepts exported workflow objects during import", () => {
    expect(coerceWorkflowDefinition({
      workflow: {
        id: "wf_1",
        definition: { nodes: [{ id: "n1" }], edges: [] },
      },
    })).toEqual({ nodes: [{ id: "n1" }], edges: [] });
  });
});
