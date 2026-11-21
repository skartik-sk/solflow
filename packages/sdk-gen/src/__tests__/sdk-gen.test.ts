import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { flowToIR } from "@solflow/ir";
import { generateSDK, instructionDiscriminator, sha256 } from "../index";

const vault = JSON.parse(
  readFileSync(join(__dirname, "../../../codegen/fixtures/templates/simple-vault.json"), "utf8"),
);
const ir = flowToIR(vault.nodes, vault.edges);

describe("sha256", () => {
  it("matches node:crypto", () => {
    for (const s of ["", "abc", "global:deposit", "x".repeat(200)]) {
      const bytes = new TextEncoder().encode(s);
      expect(Buffer.from(sha256(bytes)).toString("hex")).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });
});

describe("instructionDiscriminator", () => {
  it("anchor: first 8 bytes of sha256(global:<name>)", () => {
    expect(Buffer.from(instructionDiscriminator("anchor", "deposit", 1)).toString("hex")).toBe("f223c68952e1f2b6");
  });
  it("pinocchio: index as 8 bytes little-endian", () => {
    expect([...instructionDiscriminator("pinocchio", "deposit", 258)]).toEqual([2, 1, 0, 0, 0, 0, 0, 0]);
  });
  it("quasar: one byte", () => {
    expect([...instructionDiscriminator("quasar", "deposit", 3)]).toEqual([3]);
  });
});

describe("generateSDK", () => {
  it("puts client code under src/ where package.json, tsconfig and the example point", async () => {
    const { files } = await generateSDK(ir);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("src/index.ts");
    expect(paths.some((p) => p.startsWith("src/instructions/"))).toBe(true);
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content);
    expect(pkg.main).toBe("./src/index.ts");
  });

  it("encodes the framework discriminator into instruction data", async () => {
    const { files } = await generateSDK(ir, { framework: "anchor" });
    const deposit = files.find((f) => f.path === "src/instructions/deposit.ts")!.content;
    expect(deposit).toContain("DEPOSIT_DISCRIMINATOR");
    expect(deposit).toMatch(/discriminator/);
  });

  it("does not export the error enum and the error-code type under one name", async () => {
    const { files } = await generateSDK(ir);
    const types = files.filter((f) => f.path.startsWith("src/types/")).map((f) => f.path);
    expect(types.some((p) => /ErrorKind\.ts$/.test(p))).toBe(true);
  });
});
