// Logic parser — parse instruction handler bodies into LogicOperation[].
//
// LOSSLESS: every line of code becomes a block. Unrecognized lines become custom-code.
// Handles: require!, emit!, return err!, transfers, if/match, math, set-field,
//          let bindings, transfer(), method calls on accounts.

import type { LogicOperation } from "@solflow/ir";
import { extractBalancedBlock } from "../utils/regex-helpers";

/**
 * Parse a function body string into an array of LogicOperations.
 * Also accepts full source to resolve method calls into impl blocks.
 */
export function parseLogic(body: string, fullSource?: string, visitedMethods?: Set<string>): LogicOperation[] {
  const ops: LogicOperation[] = [];
  parseLines(body.split("\n"), ops, fullSource, visitedMethods);
  return ops;
}

function parseLines(lines: string[], ops: LogicOperation[], fullSource?: string, visitedMethods?: Set<string>): void {
  const trimmedLines = lines.map(l => l.trim());
  let i = 0;

  while (i < lines.length) {
    const line = trimmedLines[i];

    if (line === "" || line.startsWith("//")) { i++; continue; }
    if (line === "}" || line === "} else {" || line.startsWith("} else")) { i++; continue; }
    if (line === "Ok(())") { i++; continue; }
    if (line.startsWith("msg!(")) { i++; continue; }  // skip msg! logging

    const result = tryParseLine(line, trimmedLines, i, fullSource, visitedMethods);
    if (result) {
      ops.push(result.op);
      i = result.nextLine;
    } else {
      i++;
    }
  }
}

/**
 * Parse with accounts struct context for better delegation resolution.
 */
export function parseLogicWithContext(
  body: string,
  fullSource: string,
  accountsStructName: string,
  visitedMethods?: Set<string>,
): LogicOperation[] {
  const ops: LogicOperation[] = [];
  const lines = body.split("\n");
  const trimmedLines = lines.map(l => l.trim());
  let i = 0;

  while (i < lines.length) {
    const line = trimmedLines[i];

    if (line === "" || line.startsWith("//")) { i++; continue; }
    if (line === "}" || line === "} else {" || line.startsWith("} else")) { i++; continue; }
    if (line === "Ok(())") { i++; continue; }
    if (line.startsWith("msg!(")) { i++; continue; }

    const result = tryParseLine(line, trimmedLines, i, fullSource, visitedMethods, accountsStructName);
    if (result) {
      ops.push(result.op);
      i = result.nextLine;
    } else {
      i++;
    }
  }
  return ops;
}

interface LineParseResult {
  op: LogicOperation;
  nextLine: number;
}

function tryParseLine(line: string, lines: string[], currentLine: number, fullSource?: string, visitedMethods?: Set<string>, accountsStructName?: string): LineParseResult | null {
  let m;

  // 0. Skip CPI setup lines — these are noise captured by the transfer node
  if (isCpiSetupLine(line)) return null;

  // 0b. Quasar-style CPI chain: self.xxx_program.transfer_checked(...).invoke()
  //     or self.xxx_program.transfer(...).invoke()
  //     Multi-line: starts with self.xxx_program on one line, continues with .method(...).invoke()
  const cpiChain = tryParseQuasarCpiChain(line, lines, currentLine);
  if (cpiChain) return cpiChain;

  // 1. require! / require_eq! / require_gt! / require_neq! etc
  m = line.match(/^require(_\w+)?!\s*\(/);
  if (m) {
    const { text, endLine } = collectBalancedParens(lines, currentLine, line.indexOf("("));
    const inner = text.replace(/^\(/, "").trim();
    const parts = splitCommas(inner);
    if (parts.length >= 2) {
      const errorCode = parts[parts.length - 1].trim();
      const condition = parts.slice(0, -1).join(", ").trim();
      return { op: { type: "require", condition, errorCode }, nextLine: endLine };
    }
    return { op: { type: "custom-code", code: line, inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }

  // 2. emit! (single line)
  m = line.match(/^emit!\s*\(\s*(\w+)\s*\{([^}]*)\}\s*\)/);
  if (m) {
    return { op: { type: "emit-event", event: m[1], fields: parseEmitFields(m[2]) }, nextLine: currentLine + 1 };
  }

  // 2b. emit! (multi-line)
  m = line.match(/^emit!\s*\(\s*(\w+)\s*\{/);
  if (m) {
    const { fields, endLine } = collectBracedContent(lines, currentLine, m[1]);
    return { op: { type: "emit-event", event: m[1], fields }, nextLine: endLine };
  }

  // 2c. emit_cpi! macro (Anchor/Quasar CPI event emission)
  m = line.match(/^emit_cpi!\s*\(\s*(\w+)\s*\{([^}]*)\}\s*\)/);
  if (m) {
    return { op: { type: "emit-event", event: m[1], fields: parseEmitFields(m[2]) }, nextLine: currentLine + 1 };
  }
  m = line.match(/^emit_cpi!\s*\(\s*(\w+)\s*\{/);
  if (m) {
    const { fields, endLine } = collectBracedContent(lines, currentLine, m[1]);
    return { op: { type: "emit-event", event: m[1], fields }, nextLine: endLine };
  }

  // 3. return err!
  m = line.match(/^return\s+err!\s*\(\s*([\w:]+)\s*\)/);
  if (m) return { op: { type: "return-error", errorCode: m[1] }, nextLine: currentLine + 1 };

  // 4. return Err(error!(...))
  m = line.match(/^return\s+Err\s*\(\s*error!\s*\(\s*([\w:]+)\s*\)\s*\)/);
  if (m) return { op: { type: "return-error", errorCode: m[1] }, nextLine: currentLine + 1 };

  // 4a. Bare Err(...) — return without explicit `return` keyword (Quasar pattern)
  m = line.match(/^Err\s*\(\s*([\w:]+)\s*(?:\.\s*into\(\))?\s*\)/);
  if (m) return { op: { type: "return-error", errorCode: m[1] }, nextLine: currentLine + 1 };

  // 4b. Method delegation: ctx.accounts.method(args)?; or ctx.accounts.method(args);
  m = line.match(/^ctx\.accounts\.(\w+)\(([^)]*)\)\??;?$/);
  if (m && fullSource) {
    const methodName = m[1];
    if (!visitedMethods) visitedMethods = new Set();
    const visitedKey = accountsStructName ? `${accountsStructName}::${methodName}` : methodName;
    if (!visitedMethods.has(visitedKey)) {
      visitedMethods.add(visitedKey);
      const implBody = accountsStructName
        ? extractImplMethodForStruct(fullSource, methodName, accountsStructName)
        : extractImplMethod(fullSource, methodName);
      if (implBody) {
        const innerOps: LogicOperation[] = [];
        parseLines(implBody.split("\n"), innerOps, fullSource, visitedMethods);
        if (innerOps.length > 0) {
          // Return a group node that the flow converter will expand into individual nodes
          return { op: { type: "if-else", condition: `call ${methodName}()`, thenBody: innerOps }, nextLine: currentLine + 1 };
        }
      }
    }
    return { op: { type: "custom-code", code: line, inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }

  // 4c. Handler/module function delegation: handler::make::func(args)?; or module::func(args)?;
  m = line.match(/^(\w+(?:::\w+)*)\s*\(\s*context?\s*(?:,\s*[^)]*)?\)\??;?$/);
  if (m && fullSource) {
    const funcPath = m[1];
    const funcName = funcPath.split("::").pop() || funcPath;
    if (!visitedMethods) visitedMethods = new Set();
    if (!visitedMethods.has(funcName)) {
      visitedMethods.add(funcName);
      const implBody = extractImplMethod(fullSource, funcName);
      if (implBody) {
        const innerOps: LogicOperation[] = [];
        parseLines(implBody.split("\n"), innerOps, fullSource, visitedMethods);
        if (innerOps.length > 0) {
          if (innerOps.length === 1) return { op: innerOps[0], nextLine: currentLine + 1 };
          return { op: { type: "if-else", condition: `fn ${funcPath}()`, thenBody: innerOps }, nextLine: currentLine + 1 };
        }
      }
    }
    return { op: { type: "custom-code", code: line, inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }

  // 5. transfer() call (anchor_lang::system_program::transfer or bare transfer)
  m = line.match(/^(?:anchor_lang::system_program::)?transfer\s*\(/);
  if (m) {
    const fromTo = findTransferInfo(lines, currentLine);
    const amount = extractAmount(line) || "";
    const isCpiWithSigner = findPrevLine(lines, currentLine, "CpiContext::new_with_signer");
    return {
      op: {
        type: "transfer-sol",
        from: fromTo?.from || "",
        to: fromTo?.to || "",
        amount,
        ...(isCpiWithSigner ? { authority: "pda-signer" } : {}),
      },
      nextLine: currentLine + 1,
    };
  }

  // 6. anchor_spl::token operations — transfer, transfer_checked, mint_to, burn, close_account
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?(?:transfer|transfer_checked)\s*\(/);
  if (m) {
    const fromTo = findTransferInfo(lines, currentLine);
    return {
      op: { type: "transfer-token", from: fromTo?.from || "", to: fromTo?.to || "", authority: fromTo?.authority || "", amount: extractAmount(line) || "" },
      nextLine: currentLine + 1,
    };
  }
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?mint_to(?:_checked)?\s*\(/);
  if (m) {
    const info = findMintBurnInfo(lines, currentLine, m[0].includes("checked") ? "MintToChecked" : "MintTo");
    return { op: { type: "mint-to", mint: info?.mint || "", to: info?.to || "", authority: info?.authority || "", amount: extractAmount(line) || "" }, nextLine: currentLine + 1 };
  }
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?burn(?:_checked)?\s*\(/);
  if (m) {
    const info = findMintBurnInfo(lines, currentLine, m[0].includes("checked") ? "BurnChecked" : "Burn");
    return { op: { type: "burn", mint: info?.mint || "", from: info?.from || "", authority: info?.authority || "", amount: extractAmount(line) || "" }, nextLine: currentLine + 1 };
  }
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?close_account\s*\(/);
  if (m) {
    const closeInfo = findCloseAccountInfo(lines, currentLine);
    return {
      op: { type: "close-account", account: closeInfo?.account || "", destination: closeInfo?.destination || "", authority: closeInfo?.authority || "" },
      nextLine: currentLine + 1,
    };
  }
  // 6a. approve, approve_checked, freeze_account, thaw_account, set_authority, revoke, sync_native (Anchor SPL)
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?approve(?:_checked)?\s*\(/);
  if (m) {
    return { op: { type: "custom-code", code: `${m[0].includes("checked") ? "approve_checked" : "approve"} (token)`, inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?freeze_account\s*\(/);
  if (m) {
    return { op: { type: "custom-code", code: "freeze_account (token)", inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?thaw_account\s*\(/);
  if (m) {
    return { op: { type: "custom-code", code: "thaw_account (token)", inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?set_authority\s*\(/);
  if (m) {
    return { op: { type: "custom-code", code: "set_authority (token)", inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?revoke\s*\(/);
  if (m) {
    return { op: { type: "custom-code", code: "revoke (token)", inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }
  m = line.match(/(?:anchor_spl::token_interface::|anchor_spl::token::)?sync_native\s*\(/);
  if (m) {
    return { op: { type: "custom-code", code: "sync_native (token)", inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }

  // 6b. Pinocchio-style Transfer { ... }.invoke() / .invoke_signed()
  m = line.match(/^Transfer\s*\{[^}]*\}\s*\.invoke/);
  if (m) {
    // Join previous lines to find the Transfer struct
    const fromTo = findPinocchioTransferInfo(lines, currentLine);
    const isSigned = line.includes("invoke_signed");
    return {
      op: { type: "transfer-sol", from: fromTo?.from || "", to: fromTo?.to || "", amount: fromTo?.amount || "", ...(isSigned ? { authority: "pda-signer" } : {}) },
      nextLine: currentLine + 1,
    };
  }

  // 6c. Pinocchio-style CloseAccount { ... }.invoke() / .invoke_signed()
  m = line.match(/^CloseAccount\s*\{[^}]*\}\s*\.invoke/);
  if (m) {
    const closeInfo = findPinocchioCloseInfo(lines, currentLine);
    return {
      op: { type: "close-account", account: closeInfo?.account || "", destination: closeInfo?.destination || "", authority: closeInfo?.authority || "" },
      nextLine: currentLine + 1,
    };
  }

  // 6d. Pinocchio-style SetAuthority, Approve, FreezeAccount, ThawAccount, Revoke, SyncNative, MintToChecked, BurnChecked
  m = line.match(/^(SetAuthority|Approve|ApproveChecked|FreezeAccount|ThawAccount|Revoke|SyncNative|MintToChecked|BurnChecked)\s*\{[^}]*\}\s*\.invoke/);
  if (m) {
    const opName = m[1];
    return {
      op: { type: "custom-code", code: `${opName} (Pinocchio CPI)`, inputs: [], outputs: [] },
      nextLine: currentLine + 1,
    };
  }

  // 6d. invoke() — raw CPI
  m = line.match(/invoke\s*\(/);
  if (m) {
    return { op: { type: "custom-code", code: "invoke (raw CPI)", inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }

  // 7. match statement
  m = line.match(/^match\s+(.+?)\s*\{?$/);
  if (m) {
    const { body: matchBody, endLine: matchEnd } = collectBlockLines(lines, currentLine);
    const matchOps: LogicOperation[] = [];
    parseLines(matchBody, matchOps, fullSource, visitedMethods);
    return { op: { type: "if-else", condition: `match ${m[1]}`, thenBody: matchOps }, nextLine: matchEnd };
  }

  // 8. if / if let statement
  m = line.match(/^if\s+(.+?)\s*\{?\s*$/);
  if (m) {
    const condition = m[1];
    const { body: thenBody, endLine: thenEnd } = collectBlockLines(lines, currentLine);
    const thenOps: LogicOperation[] = [];
    parseLines(thenBody, thenOps, fullSource, visitedMethods);

    const afterThen = lines[thenEnd]?.trim() || "";
    let elseOps: LogicOperation[] | undefined;
    let finalLine = thenEnd;

    if (afterThen.startsWith("} else")) {
      if (afterThen.includes(" if ")) {
        const elseIfOps: LogicOperation[] = [];
        const elseIfResult = tryParseLine(afterThen.replace(/^}\s*/, ""), lines, thenEnd, fullSource, visitedMethods);
        if (elseIfResult) { elseIfOps.push(elseIfResult.op); finalLine = elseIfResult.nextLine; }
        else { finalLine = thenEnd + 1; }
        elseOps = elseIfOps;
      } else {
        const { body: elseBody, endLine: elseEnd } = collectBlockLines(lines, thenEnd);
        elseOps = [];
        parseLines(elseBody, elseOps, fullSource, visitedMethods);
        finalLine = elseEnd;
      }
    }
    return { op: { type: "if-else", condition, thenBody: thenOps, elseBody: elseOps }, nextLine: finalLine };
  }

  // 9. checked math: result = left.checked_op(right)
  m = line.match(/(\w[\w.]*)\s*=\s*(.+?)\.(checked_add|checked_sub|checked_mul|checked_div|checked_rem)\s*\(\s*([^)]+)\)/);
  if (m) {
    const opMap: Record<string, "add" | "sub" | "mul" | "div" | "mod"> = {
      checked_add: "add", checked_sub: "sub", checked_mul: "mul", checked_div: "div", checked_rem: "mod",
    };
    return { op: { type: "math", operation: opMap[m[3]], left: m[2], right: m[4].trim(), result: m[1], checked: true }, nextLine: currentLine + 1 };
  }

  // 10. Direct arithmetic: +=, -=, *=, /=, %=
  m = line.match(/^(.+?)\s*([\+\-\*\/\%])=\s*(.+);$/);
  if (m && !line.startsWith("let ")) {
    const opMap: Record<string, "add" | "sub" | "mul" | "div" | "mod"> = {
      "+": "add", "-": "sub", "*": "mul", "/": "div", "%": "mod",
    };
    const target = m[1].trim();
    return { op: { type: "math", operation: opMap[m[2]], left: target, right: m[3].trim(), result: target, checked: false }, nextLine: currentLine + 1 };
  }

  // 11. let binding: let var = ...;
  m = line.match(/^let\s+(?:mut\s+)?(\w+)\s*=\s*(.+);$/);
  if (m) {
    const varName = m[1];
    const value = m[2].trim();

    // let _ = ctx.accounts.method(args) — delegate to impl method
    if (varName === "_" && fullSource) {
      const methodCall = value.match(/ctx\.accounts\.(\w+)\(([^)]*)\)/);
      if (methodCall) {
        const methodName = methodCall[1];
        if (!visitedMethods) visitedMethods = new Set();
        if (visitedMethods.has(methodName)) {
          return { op: { type: "custom-code", code: line, inputs: [], outputs: [] }, nextLine: currentLine + 1 };
        }
        visitedMethods.add(methodName);
        const implBody = extractImplMethod(fullSource, methodName);
        if (implBody) {
          const innerOps: LogicOperation[] = [];
          parseLines(implBody.split("\n"), innerOps, fullSource, visitedMethods);
          if (innerOps.length > 0) {
            // Return all ops from impl body — inject remaining ops after this one
            // We return the first op and inject the rest via the parseLines callback
            for (let io = 1; io < innerOps.length; io++) {
              // We can't inject multiple ops from tryParseLine — so return first as a transfer
              // and the caller needs to handle the rest
              // Simplest: just concatenate them as a single complex block
            }
            // Return ALL ops by wrapping in an if-else that contains them
            if (innerOps.length === 1) {
              return { op: innerOps[0], nextLine: currentLine + 1 };
            }
            // Multiple ops — wrap as sequential operations in a thenBody
            return {
              op: {
                type: "if-else",
                condition: `call ${methodName}()`,
                thenBody: innerOps,
              },
              nextLine: currentLine + 1,
            };
          }
        }
      }
    }

    // let data = &mut ctx.accounts.account — alias binding
    const aliasMatch = value.match(/^&mut\s+ctx\.accounts\.(\w+)/);
    if (aliasMatch) {
      return {
        op: { type: "set-field", account: aliasMatch[1], field: "_alias", value: varName },
        nextLine: currentLine + 1,
      };
    }

    // let x = expr — custom-code
    return {
      op: { type: "custom-code", code: `let ${varName} = ${value}`, inputs: [value], outputs: [varName] },
      nextLine: currentLine + 1,
    };
  }

  // 12. set_inner() call — decompose into set-fields
  m = line.match(/^([\w.]+)\.set_inner\s*\(/);
  if (m) {
    // Collect multi-line set_inner content
    const accountName = cleanAccountName(m[1]);
    const { fieldStr, endLine } = collectSetInnerContent(lines, currentLine);

    if (fieldStr) {
      const fields = splitCommas(fieldStr).map(f => {
        const parts = f.trim().split(/\s*:\s*/);
        if (parts.length === 1) {
          // Shorthand: field name is the same as value (e.g. `seed` → seed: seed)
          const name = parts[0].trim();
          return name ? [name, name] : null;
        }
        return parts;
      }).filter(Boolean);
      const setOps: LogicOperation[] = fields.map(([f, v]) => ({
        type: "set-field" as const,
        account: accountName,
        field: f?.trim() || "",
        value: cleanAccountName(v?.trim() || ""),
      })).filter(op => op.field);
      if (setOps.length > 0) {
        if (setOps.length === 1) return { op: setOps[0], nextLine: endLine };
        return { op: { type: "if-else", condition: `${accountName}.set_inner()`, thenBody: setOps }, nextLine: endLine };
      }
    }
    return { op: { type: "custom-code", code: line, inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }

  // 13. set-field: account.field = value;
  m = line.match(/^(\w[\w.]*)\s*=\s*([^;]+);$/);
  if (m) {
    const setOp = parseSetField(m[1], m[2].trim());
    if (setOp) return { op: setOp, nextLine: currentLine + 1 };
    // Plain assignment as custom-code
    return { op: { type: "custom-code", code: `${m[1]} = ${m[2].trim()}`, inputs: [m[2].trim()], outputs: [m[1]] }, nextLine: currentLine + 1 };
  }

  // 13. CpiContext::new / CpiContext::new_with_signer
  m = line.match(/CpiContext::new(?:_with_signer)?\s*\(/);
  if (m) {
    const isSigned = line.includes("new_with_signer");
    return {
      op: { type: "custom-code", code: isSigned ? "CpiContext::new_with_signer" : "CpiContext::new", inputs: [], outputs: [] },
      nextLine: currentLine + 1,
    };
  }

  // 14. msg!
  m = line.match(/^msg!\s*\(.*\);?\s*$/);
  if (m) return { op: { type: "custom-code", code: "msg!", inputs: [], outputs: [] }, nextLine: currentLine + 1 };

  // 15. Transfer { ... } struct construction (standalone, before .invoke())
  m = line.match(/^Transfer\s*\{/);
  if (m) return { op: { type: "custom-code", code: line, inputs: [], outputs: [] }, nextLine: currentLine + 1 };

  // 15b. Pinocchio Transfer struct with inline .invoke(): Transfer { from: ..., to: ... }.invoke()
  m = line.match(/^Transfer\s*\{[^}]*\}\s*\.invoke/);
  if (m) {
    const fromTo = findPinocchioTransferInfo(lines, currentLine);
    const isSigned = line.includes("invoke_signed");
    return {
      op: { type: "transfer-sol", from: fromTo?.from || "", to: fromTo?.to || "", amount: fromTo?.amount || "", ...(isSigned ? { authority: "pda-signer" } : {}) },
      nextLine: currentLine + 1,
    };
  }

  // 15c. Pinocchio CloseAccount struct with inline .invoke(): CloseAccount { ... }.invoke()
  m = line.match(/^CloseAccount\s*\{[^}]*\}\s*\.invoke/);
  if (m) {
    const closeInfo = findPinocchioCloseInfo(lines, currentLine);
    return {
      op: { type: "close-account", account: closeInfo?.account || "", destination: closeInfo?.destination || "", authority: closeInfo?.authority || "" },
      nextLine: currentLine + 1,
    };
  }

  // 15d. Pinocchio other CPI structs with inline .invoke(): SetAuthority { ... }.invoke(), etc.
  m = line.match(/^(SetAuthority|Approve|ApproveChecked|FreezeAccount|ThawAccount|Revoke|SyncNative|MintToChecked|BurnChecked)\s*\{[^}]*\}\s*\.invoke/);
  if (m) {
    return { op: { type: "custom-code", code: `${m[1]} (Pinocchio CPI)`, inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }

  // 16. use statement — skip
  m = line.match(/^use\s+/);
  if (m) return null;

  // 17. self.xxx.field = value; or self.xxx = value;
  m = line.match(/^self\.([\w]+)\.([\w]+)\s*=\s*([^;]+);$/);
  if (m) {
    return { op: { type: "set-field", account: m[1], field: m[2], value: m[3].trim() }, nextLine: currentLine + 1 };
  }
  m = line.match(/^self\.([\w]+)\s*=\s*([^;]+);$/);
  if (m) {
    return { op: { type: "set-field", account: "self", field: m[1], value: m[2].trim() }, nextLine: currentLine + 1 };
  }

  // FALLBACK: anything else becomes a custom-code block (lossless)
  if (line.length > 0 && line !== ";" && line !== "{") {
    return { op: { type: "custom-code", code: line, inputs: [], outputs: [] }, nextLine: currentLine + 1 };
  }

  return null;
}

/**
 * Extract a method body from an impl block.
 * e.g. extractImplMethod(src, "deposit") finds impl Deposit { pub fn deposit(...) { <body> } }
 */
function extractImplMethod(src: string, methodName: string): string | null {
  const escaped = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 1. Prefer impl methods (pub fn method(&mut self, ...))
  const re1 = new RegExp(`pub\\s+fn\\s+${escaped}\\s*\\(\\s*(?:&mut\\s+)?self`, "g");
  let match;
  while ((match = re1.exec(src)) !== null) {
    const bodyStart = src.indexOf("{", match.index);
    if (bodyStart === -1) continue;
    const body = extractBalancedBlock(src, bodyStart);
    if (body) return body.content;
  }
  // 2. Any pub fn with that name that's inside an impl block
  const re2 = new RegExp(`pub\\s+fn\\s+${escaped}\\s*\\(`, "g");
  while ((match = re2.exec(src)) !== null) {
    const before = src.slice(Math.max(0, match.index - 300), match.index);
    if (before.includes("impl")) {
      const bodyStart = src.indexOf("{", match.index);
      if (bodyStart === -1) continue;
      const body = extractBalancedBlock(src, bodyStart);
      if (body) return body.content;
    }
  }
  // 3. Standalone handler functions (pub fn method(context: Context<...>, ...))
  while ((match = re2.exec(src)) !== null) {
    const before = src.slice(Math.max(0, match.index - 500), match.index);
    const lastProgram = before.lastIndexOf("#[program]");
    if (lastProgram !== -1) {
      const afterProgram = before.slice(lastProgram);
      const openBraces = (afterProgram.match(/\{/g) || []).length;
      const closeBraces = (afterProgram.match(/\}/g) || []).length;
      if (openBraces > closeBraces) continue;
    }
    const bodyStart = src.indexOf("{", match.index);
    if (bodyStart === -1) continue;
    const body = extractBalancedBlock(src, bodyStart);
    if (body) return body.content;
  }
  return null;
}

/**
 * Extract a method body from a specific impl block for a struct.
 * e.g. extractImplMethodForStruct(src, "handler", "TransferChecked")
 * finds impl TransferChecked { pub fn handler(...) { <body> } }
 */
function extractImplMethodForStruct(src: string, methodName: string, structName: string): string | null {
  const escapedStruct = structName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedMethod = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Find impl StructName { ... } blocks
  const implRe = new RegExp(`impl\\s+${escapedStruct}\\s*(?:<[^>]*>)?\\s*\\{`, "g");
  let match;
  while ((match = implRe.exec(src)) !== null) {
    const blockStart = src.indexOf("{", match.index);
    const block = extractBalancedBlock(src, blockStart);
    if (!block) continue;

    // Find the method inside this impl block
    const methodRe = new RegExp(`pub\\s+fn\\s+${escapedMethod}\\s*\\(`, "g");
    let mMatch;
    while ((mMatch = methodRe.exec(block.content)) !== null) {
      const bodyStart = block.content.indexOf("{", mMatch.index);
      if (bodyStart === -1) continue;
      const body = extractBalancedBlock(block.content, bodyStart);
      if (body) return body.content;
    }
  }
  return null;
}

function findPrevLine(lines: string[], currentLine: number, pattern: string): boolean {
  for (let i = currentLine - 1; i >= Math.max(0, currentLine - 5); i--) {
    if (lines[i].includes(pattern)) return true;
  }
  return false;
}

/**
 * Parse Quasar-style CPI chains: self.token_program.transfer_checked(&self.from, ...).invoke()
 * These are multi-line expressions where:
 *   line 0: self.token_program
 *   line 1:     .transfer_checked(
 *   line 2:         &self.from,
 *   ...
 *   line N:     )
 *   line N+1:     .invoke()
 *
 * Also handles single-line: self.token_program.transfer(...).invoke()
 * Also handles set_inner chains: self.xxx\n    .set_inner(...)
 */
function tryParseQuasarCpiChain(
  line: string,
  lines: string[],
  currentLine: number,
): LineParseResult | null {
  // Check if this line starts a CPI chain
  const isStart = /^self\.\w+(_program|\s*)$/.test(line) || /^self\.\w+$/.test(line);
  // Or is a single-line chain: self.token_program.transfer_checked(...).invoke()
  const isSingleLine = /^self\.\w+_program\s*\.\s*(transfer|transfer_checked|mint_to|mint_to_checked|burn|burn_checked|approve|approve_checked|close_account|freeze_account|thaw_account|set_authority|revoke|sync_native)\s*\(/.test(line);
  // Or continuation: .transfer_checked( / .invoke() / .set_inner( on its own line
  const isMethodStart = /^\.\s*(transfer|transfer_checked|mint_to|mint_to_checked|burn|burn_checked|approve|approve_checked|close_account|set_inner|freeze_account|thaw_account|set_authority|revoke|sync_native)\s*\(/.test(line);

  if (!isStart && !isSingleLine && !isMethodStart) return null;

  // Collect the full expression by joining lines until we find terminator
  const fullLines: string[] = [];
  let endLine = currentLine;

  if (isStart) {
    // Look ahead to see what follows
    let foundSetInner = false;
    for (let i = currentLine + 1; i < lines.length && i - currentLine < 10; i++) {
      if (/^\.\s*set_inner\s*\(/.test(lines[i].trim())) {
        foundSetInner = true;
        break;
      }
      if (/^\.\s*(transfer|mint_to|mint_to_checked|burn|burn_checked|approve|approve_checked|close_account|freeze_account|thaw_account|set_authority|revoke|sync_native)/.test(lines[i].trim())) break;
      if (i - currentLine > 2) break;
    }

    if (foundSetInner) {
      // It's a set_inner chain: self.xxx\n.set_inner(...)
      fullLines.push(line);
      for (let i = currentLine + 1; i < lines.length && i - currentLine < 15; i++) {
        fullLines.push(lines[i].trim());
        endLine = i;
        if (lines[i].includes(");")) break;
      }
      const full = fullLines.join(" ").replace(/\s+/g, " ");
      const setMatch = full.match(/self\.(\w+)\s*\.\s*set_inner\s*\(/);
      if (setMatch) {
        const accountName = setMatch[1];
        // Extract the struct content between { and }
        const braceStart = full.indexOf("{", full.indexOf("set_inner"));
        const braceEnd = full.lastIndexOf("}");
        if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
          const inner = full.slice(braceStart + 1, braceEnd).trim();
          const fields = splitCommas(inner).map(f => {
            const parts = f.trim().split(/\s*:\s*/);
            if (parts.length === 1) {
              const name = parts[0].trim();
              return name ? [name, name] : null;
            }
            return parts;
          }).filter(Boolean);
          const setOps: LogicOperation[] = fields.map(([f, v]) => ({
            type: "set-field" as const,
            account: accountName,
            field: f?.trim() || "",
            value: cleanAccountName(v?.trim() || ""),
          })).filter(op => op.field);
          if (setOps.length > 0) {
            if (setOps.length === 1) return { op: setOps[0], nextLine: endLine + 1 };
            return {
              op: { type: "if-else" as const, condition: `${accountName}.set_inner()`, thenBody: setOps },
              nextLine: endLine + 1,
            };
          }
        }
      }
      return { op: { type: "custom-code" as const, code: line, inputs: [], outputs: [] }, nextLine: currentLine + 1 };
    }

    // Join from current line until we find .invoke() or .invoke_signed()
    for (let i = currentLine; i < lines.length && i - currentLine < 15; i++) {
      fullLines.push(lines[i].trim());
      endLine = i;
      if (/\.\s*invoke(?:_signed)?\s*\(/.test(lines[i])) break;
    }
  } else if (isMethodStart) {
    // The method line was preceded by self.xxx_program on a previous line
    fullLines.push(lines[currentLine - 1]?.trim() || "");
    for (let i = currentLine; i < lines.length && i - currentLine < 15; i++) {
      fullLines.push(lines[i].trim());
      endLine = i;
      if (/\.\s*invoke(?:_signed)?\s*\(/.test(lines[i])) break;
    }
  } else {
    // Single line: everything is on one line
    fullLines.push(line);
    endLine = currentLine;
  }

  const full = fullLines.join(" ").replace(/\s+/g, " ");

  // Extract the method name
  const methodMatch = full.match(/\.\s*(transfer|transfer_checked|mint_to|mint_to_checked|burn|burn_checked|approve|approve_checked|close_account|freeze_account|thaw_account|set_authority|revoke|sync_native)\s*\(/);
  if (!methodMatch) return null;

  const method = methodMatch[1];

  // Extract arguments from the method call
  const parenStart = full.indexOf("(", methodMatch.index!);
  const args = extractChainArgs(full, parenStart);

  const isSigned = full.includes("invoke_signed");

  switch (method) {
    case "transfer":
    case "transfer_checked": {
      const from = args.find((a, i) => i === 0);
      const toIdx = method === "transfer_checked" ? 2 : 1;
      const authIdx = method === "transfer_checked" ? 3 : 2;
      const amountIdx = method === "transfer_checked" ? 4 : 3;

      return {
        op: {
          type: "transfer-token" as const,
          from: cleanAccountName(args[0] || ""),
          to: cleanAccountName(args[toIdx] || ""),
          authority: cleanAccountName(args[authIdx] || ""),
          amount: cleanAccountName(args[amountIdx] || ""),
          ...(isSigned ? { authority_override: "pda-signer" } : {}),
        },
        nextLine: endLine + 1,
      };
    }
    case "mint_to":
    case "mint_to_checked": {
      return {
        op: {
          type: "mint-to" as const,
          mint: cleanAccountName(args[0] || ""),
          to: cleanAccountName(args[1] || ""),
          authority: cleanAccountName(args[2] || ""),
          amount: cleanAccountName(args[3] || ""),
        },
        nextLine: endLine + 1,
      };
    }
    case "burn":
    case "burn_checked": {
      return {
        op: {
          type: "burn" as const,
          mint: cleanAccountName(args[1] || ""),
          from: cleanAccountName(args[0] || ""),
          authority: cleanAccountName(args[2] || ""),
          amount: cleanAccountName(args[3] || ""),
        },
        nextLine: endLine + 1,
      };
    }
    case "close_account": {
      return {
        op: {
          type: "close-account" as const,
          account: cleanAccountName(args[0] || ""),
          destination: cleanAccountName(args[1] || ""),
          authority: cleanAccountName(args[2] || ""),
        },
        nextLine: endLine + 1,
      };
    }
    case "approve":
    case "approve_checked":
    case "freeze_account":
    case "thaw_account":
    case "set_authority":
    case "revoke":
    case "sync_native": {
      return {
        op: { type: "custom-code" as const, code: `${method} (CPI)`, inputs: [], outputs: [] },
        nextLine: endLine + 1,
      };
    }
    default:
      return {
        op: { type: "custom-code" as const, code: `${method} (CPI)`, inputs: [], outputs: [] },
        nextLine: endLine + 1,
      };
  }
}

/**
 * Extract arguments from a balanced paren expression in a chain call.
 */
function extractChainArgs(full: string, parenStart: number): string[] {
  // Find the matching close paren
  let depth = 0;
  let end = parenStart;
  for (let i = parenStart; i < full.length; i++) {
    if (full[i] === "(") depth++;
    else if (full[i] === ")") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const inner = full.slice(parenStart + 1, end);
  // Split by commas at depth 0
  return splitCommas(inner).map(a => a.trim()).filter(Boolean);
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
  let firstOpenBraceIndex = -1;
  let breakAfterLine = false;

  while (i < lines.length) {
    const line = lines[i];
    let closeBraceIndex = -1;
    for (let ci = 0; ci < line.length; ci++) {
      if (line[ci] === '"') {
        ci++;
        while (ci < line.length && line[ci] !== '"') {
          if (line[ci] === "\\") ci++;
          ci++;
        }
        continue;
      }
      if (line[ci] === "{") {
        if (!foundOpen) firstOpenBraceIndex = ci;
        depth++;
        foundOpen = true;
      }
      else if (line[ci] === "}" && foundOpen) {
        depth--;
        if (depth === 0) {
          closeBraceIndex = ci;
          breakAfterLine = true;
          break;
        }
      }
    }

    if (foundOpen) {
      let cleaned = line;
      if (i === startLine) {
        if (firstOpenBraceIndex >= 0) {
          cleaned = line.slice(firstOpenBraceIndex + 1).trim();
        } else {
          cleaned = line.replace(/^[^{]*\{/, "").trim();
        }
      }
      if (breakAfterLine && closeBraceIndex >= 0) {
        cleaned = line.slice(0, closeBraceIndex).trim();
      }
      if (cleaned) body.push(cleaned);
    }

    i++;
    if (breakAfterLine) break;

    if (i - startLine > 200) break;
  }

  return { body, endLine: i - 1 };
}

function collectBalancedParens(lines: string[], startLine: number, parenStartCol: number): {
  text: string;
  endLine: number;
} {
  let depth = 0;
  let parts: string[] = [];
  let foundOpen = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    const startCol = (i === startLine) ? parenStartCol : 0;

    for (let ci = startCol; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') {
        ci++;
        while (ci < line.length && line[ci] !== '"') {
          if (line[ci] === "\\") ci++;
          ci++;
        }
        continue;
      }
      if (ch === '(') {
        depth++;
        foundOpen = true;
      } else if (ch === ')') {
        depth--;
        if (depth === 0 && foundOpen) {
          parts.push(line.slice(startCol, ci));
          return { text: parts.join(" "), endLine: i + 1 };
        }
      }
    }
    if (foundOpen) {
      parts.push(line.slice(startCol));
    }
    if (i - startLine > 20) break;
  }
  return { text: parts.join(" "), endLine: startLine + 1 };
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

/** Check if a line is CPI boilerplate setup (already captured in the transfer node) */
function isCpiSetupLine(line: string): boolean {
  // let sp/var = xxx.to_account_info()
  if (/^let\s+\w+\s*=\s*[\w.]+\.to_account_info\(\)/.test(line)) return true;
  // let sp2 = sp.clone()
  if (/^let\s+\w+\s*=\s*\w+\.clone\(\)/.test(line)) return true;
  // Transfer { / TransferChecked { / CloseAccount { / SetAuthority { / Approve { / etc.
  if (/^(let\s+\w+\s*=\s*)?(Transfer|TransferChecked|CloseAccount|MintTo|MintToChecked|Burn|BurnChecked|SetAuthority|Approve|ApproveChecked|FreezeAccount|ThawAccount|Revoke|SyncNative)\s*\{/.test(line)) return true;
  // closing };
  if (/^\};?\s*$/.test(line)) return true;
  // Struct field lines: from:..., to:..., mint:..., authority:..., account:..., destination:..., new_authority:..., authority_type:..., amount:..., decimals:...
  if (/^(from|to|mint|authority|account|destination|new_authority|authority_type|amount|decimals)\s*:/.test(line) && (line.includes("context.accounts") || line.includes("self.") || line.includes("accounts."))) return true;
  // CpiContext::new / CpiContext::new_with_signer
  if (/^let\s+\w+\s*=\s*CpiContext::new/.test(line)) return true;
  // seeds/signer_seed/signer_seeds setup for PDA
  if (/^let\s+\w+\s*=\s*(&\[|&\[\s*&|\[)/.test(line)) return true;
  if (/^let\s+\w+\s*:\s*\[/.test(line)) return true;
  // b"escrow", seed parts, &[...] inside seed setup
  if (/^b"/.test(line)) return true;
  if (/^&\[/.test(line)) return true;
  if (/^\]\);?$/.test(line)) return true;
  // let seed = ...
  if (/^let\s+seed\s*=/.test(line)) return true;
  // let signer_s / signer_seeds = [...]
  if (/^let\s+signer_s/.test(line)) return true;
  if (/^let\s+signer_seeds/.test(line)) return true;
  // seed.as_ref() standalone
  if (/^seed\.as_ref\(\)/.test(line)) return true;
  // Standalone .as_ref() / .to_le_bytes() expressions (seed building)
  if (/^&?\w+(\.\w+)*\.(as_ref|to_le_bytes)\(/.test(line) && !line.includes("=")) return true;
  // &context.accounts.xxx.yyy.to_le_bytes()[..], — seed fragments
  if (/^&context\.accounts\.\w+\.\w+\.to_le_bytes\(\)\[/.test(line)) return true;
  // ]], ]];, ]); — closing seed arrays
  if (/^\]{1,3}[;,]?\s*$/.test(line)) return true;
  // context.accounts.escrow.ids.to_le_bytes() as standalone
  if (/^context\.accounts\.\w+\.\w+\.\w+\(\)/.test(line) && !line.includes("=")) return true;
  // b"escrow" seed literal (already caught above, but catch in multi-word lines too)
  if (/^b"[^"]*"\s*,?\s*$/.test(line)) return true;
  // &[...] or &signer_seeds[..] standalone
  if (/^&\[\s*$/.test(line)) return true;
  // let sp / let sp2 = token_program.to_account_info() / clone()
  if (/^let\s+\w+\s*=\s*context\.accounts\.\w+\.to_account_info\(\)/.test(line)) return true;
  if (/^let\s+\w+\s*=\s*\w+\.to_account_info\(\)/.test(line)) return true;
  // Uppercase constant seed references: LIST_NFT, MARKETPLACE, etc
  if (/^[A-Z][A-Z_0-9]*,?\s*$/.test(line)) return true;
  // Seed array elements: self.xxx.to_account_info().key.as_ref(),
  if (/^self\.\w+(\.\w+)*\.to_account_info\(\)\.key\.as_ref\(\)/.test(line)) return true;
  // Seed array elements: context.accounts.xxx.to_account_info().key.as_ref(),
  if (/^context\.accounts\.\w+(\.\w+)*\.to_account_info\(\)(\.key\.as_ref\(\))?/.test(line)) return true;
  // &[self.xxx.bump], — nested seed bump
  if (/^&\[\s*self\.\w+(\.\w+)*\s*\]/.test(line)) return true;
  // &context.accounts.escrow.ids.to_le_bytes()[..],
  if (/^&context\.accounts\.\w+\.\w+\.to_le_bytes\(\)/.test(line)) return true;
  // self.xxx.to_account_info(), — standalone account info reference (in seed arrays / CPI setup)
  if (/^self\.\w+(\.\w+)*\.to_account_info\(\),?\s*$/.test(line)) return true;
  // self.xxx.to_account_info(), inside TransferChecked/CpiContext struct fields
  if (/^\w+\s*:\s*self\.\w+(\.\w+)*\.to_account_info\(\)/.test(line)) return true;
  // CloseAccount { struct construction
  if (/^(let\s+\w+\s*=\s*)?CloseAccount\s*\{/.test(line)) return true;
  // account: / destination: fields in CloseAccount / SetAuthority / Approve
  if (/^(account|destination|authority|new_authority|authority_type)\s*:/.test(line) && (line.includes(".to_account_info()") || line.includes("context.accounts") || line.includes("self.accounts"))) return true;
  // }, — struct/closing brace followed by comma
  if (/^\},?\s*$/.test(line)) return true;
  // ); — standalone closing paren + semi (CPI call closings)
  if (/^\);?\s*$/.test(line)) return true;
  // Pinocchio: self.accounts.xxx field references inside Transfer/CloseAccount/etc structs
  if (/^self\.accounts\.\w+(\.key\(\))?\.as_ref\(\),?\s*$/.test(line)) return true;
  if (/^self\.accounts\.\w+(\.\w+)*\.to_account_info\(\),?\s*$/.test(line)) return true;
  // let cpi_program / let cpi_accounts / let cpi_context / let ctx = ...
  if (/^let\s+cpi_\w+\s*=/.test(line)) return true;
  if (/^let\s+cpi_program/.test(line)) return true;
  // signer_seeds, — standalone reference
  if (/^signer_seeds,?\s*$/.test(line)) return true;
  // signer — standalone (inside CpiContext::new_with_signer call)
  if (/^signer,?\s*$/.test(line)) return true;
  // MintTo { — struct construction for CPI
  if (/^MintTo(?:Checked)?\s*\{/.test(line)) return true;
  // Burn { — struct construction for CPI
  if (/^Burn(?:Checked)?\s*\{/.test(line)) return true;
  // Approve { / ApproveChecked { — struct construction for CPI
  if (/^Approve(?:Checked)?\s*\{/.test(line)) return true;
  // SetAuthority { — struct construction for CPI
  if (/^SetAuthority\s*\{/.test(line)) return true;
  // FreezeAccount { / ThawAccount { — struct construction for CPI
  if (/^(FreezeAccount|ThawAccount)\s*\{/.test(line)) return true;
  // Revoke { — struct construction for CPI
  if (/^Revoke\s*\{/.test(line)) return true;
  // SyncNative { — struct construction for CPI
  if (/^SyncNative\s*\{/.test(line)) return true;
  // Error codes from checked math: CustomError::Overflow, )?;
  if (/^\w+::\w+,?\s*$/.test(line) && line.includes("Error")) return true;
  if (/^\)\?;?\s*$/.test(line)) return true;
  // .ok_or(...) / .unwrap() standalone continuations (after closing paren)
  if (/^\)\s*\.(ok_or|unwrap|expect)\(/.test(line)) return true;
  // Pinocchio patterns: Seed::from(), Signer::from()
  if (/^Seed::from\(/.test(line)) return true;
  if (/^Signer::from\(/.test(line)) return true;
  if (/^let\s+\w+_seeds\s*=/.test(line)) return true;
  if (/^let\s+\w+_binding\s*=/.test(line)) return true;
  if (/^let\s+signer\s*=\s*Signer::from/.test(line)) return true;
  if (/^let\s+bump_binding\s*=/.test(line)) return true;
  // Pinocchio: msg!("checkpoint ...") logging
  if (/^msg!\("checkpoint/.test(line)) return true;
  // Pinocchio: .invoke()? and .invoke_signed(...)?; on Transfer/CloseAccount lines are handled by the op parser
  // Drop lines: drop(data);
  if (/^drop\(/.test(line)) return true;
  // Pinocchio: ProgramAccount::close() is handled as close-account
  // TokenAccount::from_account_info — data loading
  if (/^let\s+\w+\s*=\s*TokenAccount::from_account_info/.test(line)) return true;
  if (/^let\s+\w+\s*=\s*Escrow::load/.test(line)) return true;
  // Pinocchio: create_program_address / find_program_address calls for validation
  if (/^let\s+\w+\s*=\s*(create|find)_program_address/.test(line)) return true;
  // Escrow::load / load_mut data access
  if (/^let\s+data\s*=\s*/.test(line) && line.includes("try_borrow_data")) return true;
  if (/^let\s+escrow\s*=\s*Escrow::load/.test(line)) return true;
  // Key comparison checks
  if (/^if\s+&\w+_key\s*!=/.test(line) && line.includes("key()")) return true;
  // Quasar CPI chain parts: &self.from, &self.to, etc. inside .transfer_checked(...)
  if (/^&self\.\w+,?\s*$/.test(line)) return true;
  // Quasar CPI chain: standalone .invoke() / .invoke_signed() line
  if (/^\.\s*invoke(?:_signed)?\s*\(\s*\)\s*$/.test(line)) return true;
  // Quasar CPI chain: closing paren of method call
  if (/^\)\s*$/.test(line)) return true;
  // Quasar CPI chain: amount/decimals args on their own line
  if (/^(amount|decimals),?\s*$/.test(line)) return true;
  return false;
}

/**
 * Collect multi-line set_inner content.
 * Handles both single-line: set_inner(Struct { field: val })
 * and multi-line: set_inner(Struct {\n  field: val,\n})
 */
function collectSetInnerContent(lines: string[], startLine: number): { fieldStr: string; endLine: number } {
  // Check if it's already complete on one line
  const firstLine = lines[startLine];
  const singleLineMatch = firstLine.match(/set_inner\s*\(\s*\w+\s*\{([^}]*)\}/);
  if (singleLineMatch) {
    return { fieldStr: singleLineMatch[1], endLine: startLine + 1 };
  }

  // Multi-line: collect until we find closing });
  const collected: string[] = [];
  let i = startLine;
  let foundOpenBrace = false;

  while (i < lines.length && i - startLine < 30) {
    const line = lines[i];
    let content = line.trim();
    if (i === startLine) {
      const braceIdx = content.indexOf("{");
      if (braceIdx >= 0) {
        content = content.slice(braceIdx + 1).trim();
        foundOpenBrace = true;
      }
    }
    // Check for closing });
    const closeMatch = content.match(/^(.*?)\}\s*\)?\s*;?\s*$/);
    if (closeMatch && foundOpenBrace && i > startLine) {
      if (closeMatch[1].trim()) collected.push(closeMatch[1].trim());
      return { fieldStr: collected.join(", "), endLine: i + 1 };
    }
    if (foundOpenBrace && content && !content.startsWith("set_inner")) {
      collected.push(content);
    }
    i++;
  }

  return { fieldStr: collected.join(", "), endLine: startLine + 1 };
}

function findCloseAccountInfo(lines: string[], currentLine: number): { account: string; destination: string; authority: string } | null {
  // Join lines around the close_account call to handle multi-line CloseAccount { ... }
  for (let start = Math.max(0, currentLine - 15); start < currentLine; start++) {
    if (!lines[start].includes("CloseAccount")) continue;
    const chunk = lines.slice(start, currentLine + 1).join(" ").replace(/\s+/g, " ");
    const m = chunk.match(/CloseAccount\s*\{[^}]*account\s*:\s*([\w.]+)[^}]*authority\s*:\s*([\w.]+)[^}]*destination\s*:\s*([\w.]+)/);
    if (m) return { account: cleanAccountName(m[1]), authority: cleanAccountName(m[2]), destination: cleanAccountName(m[3]) };
    // Try other field orderings
    const result: { account: string; destination: string; authority: string } = { account: "", destination: "", authority: "" };
    const acM = chunk.match(/account\s*:\s*([\w.]+)/);
    if (acM) result.account = cleanAccountName(acM[1]);
    const destM = chunk.match(/destination\s*:\s*([\w.]+)/);
    if (destM) result.destination = cleanAccountName(destM[1]);
    const authM = chunk.match(/authority\s*:\s*([\w.]+)/);
    if (authM) result.authority = cleanAccountName(authM[1]);
    if (result.account) return result;
  }
  return null;
}

/** Find Transfer info from Pinocchio-style Transfer { from: x, to: y, authority: z, amount: n }.invoke() */
function findPinocchioTransferInfo(lines: string[], currentLine: number): { from: string; to: string; authority: string; amount: string } | null {
  // Join lines around current position to get full Transfer struct
  for (let start = Math.max(0, currentLine - 5); start <= currentLine; start++) {
    const chunk = lines.slice(start, currentLine + 1).join(" ").replace(/\s+/g, " ");
    const m = chunk.match(/Transfer\s*\{[^}]*from\s*:\s*self\.accounts\.(\w+)[^}]*to\s*:\s*self\.accounts\.(\w+)[^}]*authority\s*:\s*self\.accounts\.(\w+)[^}]*amount\s*:\s*([^,}\s]+)/);
    if (m) return { from: m[1], to: m[2], authority: m[3], amount: cleanAccountName(m[4]) };
    // Try with context.accounts
    const m2 = chunk.match(/Transfer\s*\{[^}]*from\s*:\s*([\w.]+)[^}]*to\s*:\s*([\w.]+)[^}]*authority\s*:\s*([\w.]+)[^}]*amount\s*:\s*([^,}\s]+)/);
    if (m2) return { from: cleanAccountName(m2[1]), to: cleanAccountName(m2[2]), authority: cleanAccountName(m2[3]), amount: cleanAccountName(m2[4]) };
  }
  return null;
}

/** Find CloseAccount info from Pinocchio-style CloseAccount { account: x, destination: y, authority: z }.invoke_signed() */
function findPinocchioCloseInfo(lines: string[], currentLine: number): { account: string; destination: string; authority: string } | null {
  for (let start = Math.max(0, currentLine - 5); start <= currentLine; start++) {
    const chunk = lines.slice(start, currentLine + 1).join(" ").replace(/\s+/g, " ");
    const m = chunk.match(/CloseAccount\s*\{[^}]*account\s*:\s*self\.accounts\.(\w+)[^}]*destination\s*:\s*self\.accounts\.(\w+)[^}]*authority\s*:\s*self\.accounts\.(\w+)/);
    if (m) return { account: m[1], destination: m[2], authority: m[3] };
    const m2 = chunk.match(/CloseAccount\s*\{[^}]*account\s*:\s*([\w.]+)[^}]*destination\s*:\s*([\w.]+)[^}]*authority\s*:\s*([\w.]+)/);
    if (m2) return { account: cleanAccountName(m2[1]), destination: cleanAccountName(m2[2]), authority: cleanAccountName(m2[3]) };
  }
  return null;
}

function findTransferInfo(lines: string[], currentLine: number): TransferInfo | null {
  const result: TransferInfo = { from: "", to: "" };

  for (let i = currentLine - 1; i >= Math.max(0, currentLine - 20); i--) {
    const line = lines[i];

    // Try to match Transfer/TransferChecked { from: ..., to: ... } in a single line
    const m = line.match(/(?:Transfer|TransferChecked)\s*\{[^}]*from\s*:\s*([\w.]+)[^}]*to\s*:\s*([\w.]+)[^}]*\}/);
    if (m) { result.from = cleanAccountName(m[1]); result.to = cleanAccountName(m[2]); }

    const m2 = line.match(/(?:Transfer|TransferChecked)\s*\{[^}]*to\s*:\s*([\w.]+)[^}]*from\s*:\s*([\w.]+)[^}]*\}/);
    if (m2) { result.from = cleanAccountName(m2[2]); result.to = cleanAccountName(m2[1]); }

    if (!result.from || !result.to) {
      const fromM = line.match(/from\s*:\s*([\w.]+)/);
      if (fromM) result.from = cleanAccountName(fromM[1]);
      const toM = line.match(/to\s*:\s*([\w.]+)/);
      if (toM) result.to = cleanAccountName(toM[1]);
    }

    // Also check TransferChecked with mint/authority
    if (!result.from) {
      const fromM2 = line.match(/from\s*:\s*(context\.accounts\.\w+|ctx\.accounts\.\w+|self\.\w+)/);
      if (fromM2) result.from = cleanAccountName(fromM2[1]);
    }

    const m3 = line.match(/authority\s*:\s*([\w.]+)/);
    if (m3) result.authority = cleanAccountName(m3[1]);
  }

  return (result.from || result.to) ? result : null;
}

/** Strip self. prefix, context.accounts. prefix, .to_account_info() suffix, and other noise */
function cleanAccountName(name: string): string {
  return name
    .replace(/^&self\./, "")
    .replace(/^&?context\.accounts\./, "")
    .replace(/^&?ctx\.accounts\./, "")
    .replace(/^self\./, "")
    .replace(/^&/, "")
    .replace(/\.to_account_info\(?\)?$/, "")
    .replace(/\.key\(?\)?$/, "")
    .replace(/\.as_ref\(?\)?$/, "")
    .replace(/\.clone\(?\)?$/, "")
    .replace(/\.decimals$/, "");
}

function findMintBurnInfo(
  lines: string[],
  currentLine: number,
  structName: string,
): Record<string, string> | null {
  for (let i = currentLine - 1; i >= Math.max(0, currentLine - 20); i--) {
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
  // For transfer_checked(ctx, amount, decimals), extract the amount (second arg), not decimals
  if (line.includes("transfer_checked")) {
    const m = line.match(/transfer_checked\s*\([^,]+,\s*([^,]+),/);
    if (m) return cleanAccountName(m[1].trim());
  }
  // For transfer(ctx, amount), extract amount
  const m = line.match(/(?:anchor_spl::[^(]+\s*\([^,]+|transfer\s*\([^,]+),\s*([^,)]+?)\s*[),]/);
  if (m) return cleanAccountName(m[1].trim());
  const m2 = line.match(/,\s*([^,)]+?)\s*\)/);
  if (m2) return cleanAccountName(m2[1].trim());
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

function splitCommas(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let ci = 0;

  while (ci < src.length) {
    const ch = src[ci];
    if (ch === '"') {
      current += ch;
      ci++;
      while (ci < src.length && src[ci] !== '"') {
        if (src[ci] === "\\") { current += src[ci]; ci++; }
        current += src[ci];
        ci++;
      }
      if (ci < src.length) { current += src[ci]; ci++; }
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;

    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
    ci++;
  }
  if (current.trim()) parts.push(current);

  return parts;
}

function parseSetField(lhs: string, value: string): LogicOperation | null {
  const parts = lhs.split(".");
  if (parts.length < 2) return null;

  // self.account.field = value → account: "account", field: "field"
  if (parts.length >= 3 && parts[0] === "self") {
    return { type: "set-field", account: parts[1], field: parts.slice(2).join("."), value };
  }
  if (parts.length >= 4 && parts[0] === "ctx" && parts[1] === "accounts") {
    return { type: "set-field", account: parts[2], field: parts.slice(3).join("."), value };
  }
  if (parts.length === 3 && parts[0] === "ctx" && parts[1] === "accounts") {
    return { type: "set-field", account: parts[2], field: "value", value };
  }
  if (parts.length === 2) {
    return { type: "set-field", account: parts[0], field: parts[1], value };
  }
  return { type: "set-field", account: parts[0], field: parts.slice(1).join("."), value };
}
