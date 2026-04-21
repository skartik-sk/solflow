// Logic parser — parse instruction handler bodies into LogicOperation[].
//
// Uses a line-by-line approach to avoid regex lookbehind issues and OOM.

import type { LogicOperation } from "@solflow/ir";
import { extractBalancedBlock } from "../utils/regex-helpers";

/**
 * Parse a function body string into an array of LogicOperations.
 */
export function parseLogic(body: string): LogicOperation[] {
  const ops: LogicOperation[] = [];
  parseLines(body.split("\n"), ops);
  return ops;
}

function parseLines(lines: string[], ops: LogicOperation[]): void {
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip blank lines and comments
    if (line === "" || line.startsWith("//")) {
      i++;
      continue;
    }

    // Skip closing braces and else keywords (handled by if-else)
    if (line === "}" || line === "} else {" || line.startsWith("} else")) {
      i++;
      continue;
    }

    // Skip Ok(()) and standalone Ok(())
    if (line === "Ok(()))" || line === "Ok(())" || line === "Ok(())" || line === "Ok(())") {
      i++;
      continue;
    }

    // Try each pattern
    const result = tryParseLine(line, lines, i);
    if (result) {
      ops.push(result.op);
      i = result.nextLine;
    } else {
      i++;
    }
  }
}

interface LineParseResult {
  op: LogicOperation;
  nextLine: number;
}

function tryParseLine(line: string, lines: string[], currentLine: number): LineParseResult | null {
  // 1. require! macro
  let m = line.match(/^require(_\w+)?!\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/);
  if (m) {
    return {
      op: { type: "require", condition: m[2].trim(), errorCode: m[3].trim() },
      nextLine: currentLine + 1,
    };
  }

  // 2. emit! macro (single line or multi-line)
  m = line.match(/^emit!\s*\(\s*(\w+)\s*\{([^}]*)\}\s*\)/);
  if (m) {
    const fields = parseEmitFields(m[2]);
    return {
      op: { type: "emit-event", event: m[1], fields },
      nextLine: currentLine + 1,
    };
  }

  // Multi-line emit!
  m = line.match(/^emit!\s*\(\s*(\w+)\s*\{/);
  if (m) {
    const { fields, endLine } = collectBracedContent(lines, currentLine, m[1]);
    return {
      op: { type: "emit-event", event: m[1], fields },
      nextLine: endLine,
    };
  }

  // 3. return err!
  m = line.match(/^return\s+err!\s*\(\s*(\w+)\s*\)/);
  if (m) {
    return {
      op: { type: "return-error", errorCode: m[1] },
      nextLine: currentLine + 1,
    };
  }

  // 4. return Err(error!(...))
  m = line.match(/^return\s+Err\s*\(\s*error!\s*\(\s*(\w+)\s*\)\s*\)/);
  if (m) {
    return {
      op: { type: "return-error", errorCode: m[1] },
      nextLine: currentLine + 1,
    };
  }

  // 5. anchor_lang::system_program::transfer
  m = line.match(/anchor_lang::system_program::transfer\s*\(/);
  if (m) {
    // Look back for Transfer { from, to }
    const fromTo = findTransferInfo(lines, currentLine);
    // Look for amount on this line or in CpiContext block
    const amount = extractAmount(line) || "?";
    return {
      op: {
        type: "transfer-sol",
        from: fromTo?.from || "",
        to: fromTo?.to || "",
        amount,
      },
      nextLine: currentLine + 1,
    };
  }

  // 6. anchor_spl::token::transfer
  m = line.match(/anchor_spl::token::(?:transfer|transfer_checked)\s*\(/);
  if (m) {
    const fromTo = findTransferInfo(lines, currentLine);
    const amount = extractAmount(line) || "?";
    return {
      op: {
        type: "transfer-token",
        from: fromTo?.from || "",
        to: fromTo?.to || "",
        authority: fromTo?.authority || "",
        amount,
      },
      nextLine: currentLine + 1,
    };
  }

  // 7. anchor_spl::token::mint_to
  m = line.match(/anchor_spl::token::mint_to\s*\(/);
  if (m) {
    const info = findMintBurnInfo(lines, currentLine, "MintTo");
    const amount = extractAmount(line) || "?";
    return {
      op: {
        type: "mint-to",
        mint: info?.mint || "",
        to: info?.to || "",
        authority: info?.authority || "",
        amount,
      },
      nextLine: currentLine + 1,
    };
  }

  // 8. anchor_spl::token::burn
  m = line.match(/anchor_spl::token::burn\s*\(/);
  if (m) {
    const info = findMintBurnInfo(lines, currentLine, "Burn");
    const amount = extractAmount(line) || "?";
    return {
      op: {
        type: "burn",
        mint: info?.mint || "",
        from: info?.from || "",
        authority: info?.authority || "",
        amount,
      },
      nextLine: currentLine + 1,
    };
  }

  // 9. if statement
  m = line.match(/^if\s+(.+?)\s*\{$/);
  if (m) {
    const condition = m[1];
    const { body: thenBody, endLine: thenEnd } = collectBlockLines(lines, currentLine);
    const thenOps: LogicOperation[] = [];
    parseLines(thenBody, thenOps);

    // Check for else
    const afterThen = lines[thenEnd]?.trim() || "";
    let elseOps: LogicOperation[] | undefined;
    let finalLine = thenEnd;

    if (afterThen.startsWith("} else {") || afterThen === "} else{") {
      const { body: elseBody, endLine: elseEnd } = collectBlockLines(lines, thenEnd);
      elseOps = [];
      parseLines(elseBody, elseOps);
      finalLine = elseEnd;
    }

    return {
      op: {
        type: "if-else",
        condition,
        thenBody: thenOps,
        elseBody: elseOps,
      },
      nextLine: finalLine,
    };
  }

  // 10. checked math: result = left.checked_op(right)
  m = line.match(/(\w+)\s*=\s*(\w+)\.(checked_add|checked_sub|checked_mul|checked_div|checked_rem)\s*\(\s*([^)]+)\)/);
  if (m) {
    const opMap: Record<string, "add" | "sub" | "mul" | "div" | "mod"> = {
      checked_add: "add", checked_sub: "sub", checked_mul: "mul",
      checked_div: "div", checked_rem: "mod",
    };
    return {
      op: {
        type: "math",
        operation: opMap[m[3]],
        left: m[2],
        right: m[4].trim(),
        result: m[1],
        checked: true,
      },
      nextLine: currentLine + 1,
    };
  }

  // 11. Direct arithmetic with +=  (account.field += value)
  m = line.match(/^ctx\.accounts\.(\w+)\.(\w+)\s*\+=\s*(.+);$/);
  if (m) {
    return {
      op: {
        type: "math",
        operation: "add",
        left: `ctx.accounts.${m[1]}.${m[2]}`,
        right: m[3].trim().replace(/;$/, ""),
        result: `ctx.accounts.${m[1]}.${m[2]}`,
        checked: false,
      },
      nextLine: currentLine + 1,
    };
  }

  // 12. set-field: ctx.accounts.xxx.field = value;
  m = line.match(/^ctx\.accounts\.(\w+)\.(\w+)\s*=\s*([^;]+);$/);
  if (m) {
    return {
      op: {
        type: "set-field",
        account: m[1],
        field: m[2],
        value: m[3].trim(),
      },
      nextLine: currentLine + 1,
    };
  }

  // 13. set-field without ctx prefix: account.field = value;
  m = line.match(/^(\w+)\.(\w+)\s*=\s*([^;]+);$/);
  if (m && !line.startsWith("let ") && !line.startsWith("let mut")) {
    return {
      op: {
        type: "set-field",
        account: m[1],
        field: m[2],
        value: m[3].trim(),
      },
      nextLine: currentLine + 1,
    };
  }

  // 14. CpiContext — skip, captured as custom-code
  m = line.match(/CpiContext::new(?:_with_signer)?\s*\(/);
  if (m) {
    return {
      op: { type: "custom-code", code: "CpiContext::new", inputs: [], outputs: [] },
      nextLine: currentLine + 1,
    };
  }

  // 15. msg! — skip
  m = line.match(/^msg!\s*\(.*\);?\s*$/);
  if (m) {
    return { op: { type: "custom-code", code: "msg!", inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }

  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function collectBlockLines(lines: string[], startLine: number): {
  body: string[];
  endLine: number;
} {
  const body: string[] = [];
  let depth = 0;
  let i = startLine;
  let foundOpen = false;

  while (i < lines.length) {
    const line = lines[i];
    // Simple brace counting — skip braces inside string literals
    for (let ci = 0; ci < line.length; ci++) {
      if (line[ci] === '"') {
        ci++;
        while (ci < line.length && line[ci] !== '"') {
          if (line[ci] === "\\") ci++;
          ci++;
        }
        continue;
      }
      if (line[ci] === "{") { depth++; foundOpen = true; }
      else if (line[ci] === "}") depth--;
    }

    if (foundOpen && depth >= 0) {
      // Strip leading { from first body line
      let cleaned = line;
      if (i === startLine) {
        cleaned = line.replace(/^[^{]*\{/, "").trim();
      }
      // Strip trailing } from last body line
      if (depth === 0) {
        cleaned = cleaned.replace(/\}[^}]*$/, "").trim();
      }
      if (cleaned) body.push(cleaned);
    }

    i++;
    if (foundOpen && depth === 0) break;

    // Safety: don't scan more than 200 lines
    if (i - startLine > 200) break;
  }

  return { body, endLine: i };
}

function collectBracedContent(lines: string[], startLine: number, _eventName: string): {
  fields: Record<string, string>;
  endLine: number;
} {
  const fields: Record<string, string> = {};
  let i = startLine + 1;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.includes("}")) break;

    const m = trimmed.match(/(\w+)\s*:\s*(.+?)(?:,|$)/);
    if (m) {
      fields[m[1]] = m[2].trim();
    }
    i++;
  }

  return { fields, endLine: i + 1 };
}

interface TransferInfo {
  from: string;
  to: string;
  authority?: string;
}

function findTransferInfo(lines: string[], currentLine: number): TransferInfo | null {
  // Look backwards up to 10 lines for Transfer { from, to, authority }
  for (let i = currentLine - 1; i >= Math.max(0, currentLine - 10); i--) {
    const line = lines[i];
    const m = line.match(/Transfer\s*\{[^}]*from\s*:\s*(\w+)[^}]*to\s*:\s*(\w+)[^}]*\}/);
    if (m) return { from: m[1], to: m[2] };

    const m2 = line.match(/Transfer\s*\{[^}]*to\s*:\s*(\w+)[^}]*from\s*:\s*(\w+)[^}]*\}/);
    if (m2) return { from: m2[2], to: m2[1] };

    // authority
    const m3 = line.match(/authority\s*:\s*(\w+)/);
    if (m3) {
      const existing = findTransferInfo(lines, i);
      if (existing) return { ...existing, authority: m3[1] };
    }
  }
  return null;
}

function findMintBurnInfo(
  lines: string[],
  currentLine: number,
  structName: string,
): Record<string, string> | null {
  for (let i = currentLine - 1; i >= Math.max(0, currentLine - 10); i--) {
    const block = lines.slice(i, currentLine + 1).join(" ");
    const re = new RegExp(`${structName}\\s*\\{([^}]+)\\}`);
    const m = block.match(re);
    if (m) {
      const inner = m[1];
      const result: Record<string, string> = {};
      for (const field of ["mint", "to", "from", "authority"]) {
        const fm = inner.match(new RegExp(`${field}\\s*:\\s*(\\w+)`));
        if (fm) result[field] = fm[1];
      }
      return result;
    }
  }
  return null;
}

function extractAmount(line: string): string | null {
  const m = line.match(/,\s*([^,)]+)\s*\)\s*\?/);
  if (m) return m[1].trim();
  const m2 = line.match(/,\s*([^,)]+)\s*\)/);
  if (m2) return m2[1].trim();
  return null;
}

function parseEmitFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of body.split(",")) {
    const m = part.trim().match(/(\w+)\s*:\s*(.+)/);
    if (m) {
      fields[m[1]] = m[2].trim();
    }
  }
  return fields;
}
