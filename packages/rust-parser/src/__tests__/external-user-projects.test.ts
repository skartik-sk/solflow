import { existsSync } from "fs";
import { describe, expect, it } from "vitest";
import { parseProgram } from "../index";

const EXTERNAL_PROJECTS = [
  {
    name: "anchor-contract/vault",
    path: "/Users/singupallikartik/Developer/anchor-contract/vault",
    framework: "anchor",
    minInstructions: 1,
    minAccounts: 1,
  },
  {
    name: "anchor-contract/escrow",
    path: "/Users/singupallikartik/Developer/anchor-contract/escrow",
    framework: "anchor",
    minInstructions: 1,
    minAccounts: 1,
  },
  {
    name: "anchor-contract/amm",
    path: "/Users/singupallikartik/Developer/anchor-contract/amm",
    framework: "anchor",
    minInstructions: 1,
    minAccounts: 1,
  },
  {
    name: "anchor-contract/calculator",
    path: "/Users/singupallikartik/Developer/anchor-contract/calculator",
    framework: "anchor",
    minInstructions: 1,
    minAccounts: 1,
  },
  {
    name: "anchor-contract/marketplace",
    path: "/Users/singupallikartik/Developer/anchor-contract/marketplace",
    framework: "anchor",
    minInstructions: 1,
    minAccounts: 1,
  },
  {
    name: "anchor-contract/staking",
    path: "/Users/singupallikartik/Developer/anchor-contract/staking",
    framework: "anchor",
    minInstructions: 1,
    minAccounts: 1,
  },
  {
    name: "pinocchio-contract/vault",
    path: "/Users/singupallikartik/Developer/pinocchio-contract/vault",
    framework: "pinocchio",
    minInstructions: 1,
    minAccounts: 0,
  },
  {
    name: "pinocchio-contract/basic/hello-solana",
    path: "/Users/singupallikartik/Developer/pinocchio-contract/basic/hello-solana",
    framework: "pinocchio",
    minInstructions: 1,
    minAccounts: 0,
  },
  {
    name: "pinocchio-contract/basic/Counter",
    path: "/Users/singupallikartik/Developer/pinocchio-contract/basic/Counter",
    framework: "pinocchio",
    minInstructions: 1,
    minAccounts: 0,
  },
  {
    name: "pinocchio-contract/basic/account-data",
    path: "/Users/singupallikartik/Developer/pinocchio-contract/basic/account-data",
    framework: "pinocchio",
    minInstructions: 1,
    minAccounts: 0,
  },
  {
    name: "pinocchio-contract/basic/checking-accounts",
    path: "/Users/singupallikartik/Developer/pinocchio-contract/basic/checking-accounts",
    framework: "pinocchio",
    minInstructions: 1,
    minAccounts: 0,
  },
  {
    name: "pinocchio-contract/token/escrow",
    path: "/Users/singupallikartik/Developer/pinocchio-contract/token/escrow",
    framework: "pinocchio",
    minInstructions: 1,
    minAccounts: 0,
  },
  {
    name: "pinocchio-contract/token/transfer-token",
    path: "/Users/singupallikartik/Developer/pinocchio-contract/token/transfer-token",
    framework: "pinocchio",
    minInstructions: 1,
    minAccounts: 0,
  },
] as const;

describe("external user project smoke fixtures", () => {
  for (const project of EXTERNAL_PROJECTS) {
    const run = existsSync(project.path) ? it : it.skip;

    run(`parses ${project.name}`, () => {
      const result = parseProgram(project.path, {
        sourceCoverage: { includeTests: true },
      });

      expect(result.report.framework).toBe(project.framework);
      expect(result.stats.instructions).toBeGreaterThanOrEqual(
        project.minInstructions,
      );
      expect(result.stats.accounts).toBeGreaterThanOrEqual(project.minAccounts);
      expect(result.report.confidence).not.toBe("low");
    });
  }
});
