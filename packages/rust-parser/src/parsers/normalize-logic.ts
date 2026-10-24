// Normalize parsed handler logic into the IR's expression conventions, which every generator
// understands: state fields as `account.field`, keys as `ctx.accounts.account.key()`, bumps
// as `ctx.bumps.account`. Real Anchor code reaches the same things many ways — `self.x`,
// `ctx.accounts.x`, local aliases (`let data = &mut ctx.accounts.account;`), a `bumps` param.

import type { ParsedLogicOperation } from "../types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normalizeLogic(ops: ParsedLogicOperation[], accountNames: string[]): ParsedLogicOperation[] {
  const accounts = new Set(accountNames);
  const aliases = new Map<string, string>();

  const expr = (value: string): string => {
    // The handler's Context parameter may be called anything; the IR calls it `ctx`.
    let s = value.replace(/(?<![.\w])context\.(accounts|bumps|program_id|remaining_accounts)\b/g, "ctx.$1");
    for (const [alias, account] of aliases) {
      s = s.replace(new RegExp(`(?<![.\\w])${escape(alias)}(?![\\w])`, "g"), account);
    }
    // self.x / ctx.accounts.x / context.accounts.x → x (keys keep the ctx form)
    s = s.replace(/(?<![.\w])(?:self|ctx\.accounts|context\.accounts)\.(\w+)/g, (m, name: string) =>
      accounts.has(name) ? name : m,
    );
    s = s.replace(/(?<![.\w])(\w+)\.key\(\)/g, (m, name: string) => (accounts.has(name) ? `ctx.accounts.${name}.key()` : m));
    // `bumps.x` from a `bumps: XBumps` handler parameter
    s = s.replace(/(?<![.\w])bumps\./g, "ctx.bumps.");
    return s;
  };

  const visit = (list: ParsedLogicOperation[]): ParsedLogicOperation[] => {
    const out: ParsedLogicOperation[] = [];
    for (const op of list) {
      if (op.type === "set-field" && op.field === "_alias") {
        aliases.set(op.value, op.account);
        continue;
      }
      if (op.type === "custom-code") {
        // let x = &ctx.accounts.y; / let x = &mut self.y; — an alias, not code
        const alias = op.code.match(/^let\s+(?:mut\s+)?(\w+)\s*=\s*&(?:mut\s+)?(?:self|ctx\.accounts|context\.accounts)\.(\w+)\s*;?$/);
        if (alias && accounts.has(alias[2])) {
          aliases.set(alias[1], alias[2]);
          continue;
        }
        out.push({ ...op, code: expr(op.code), inputs: op.inputs.map(expr) });
        continue;
      }
      switch (op.type) {
        case "parser-group":
          out.push({ ...op, body: visit(op.body) });
          break;
        case "if-else":
          out.push({ ...op, condition: expr(op.condition), thenBody: visit(op.thenBody), elseBody: op.elseBody && visit(op.elseBody) });
          break;
        case "set-field":
          out.push({ ...op, account: aliases.get(op.account) ?? op.account, value: expr(op.value) });
          break;
        case "math": {
          const left = expr(op.left);
          const right = expr(op.right);
          const result = expr(op.result);
          // `data.num += n` updates a field: that's a set-field, not a new local.
          const field = result.match(/^(\w+)\.(\w+)$/);
          if (field && accounts.has(field[1])) {
            const sym = { add: "+", sub: "-", mul: "*", div: "/", mod: "%" }[op.operation];
            const value = op.checked
              ? `${left}.checked_${op.operation === "mod" ? "rem" : op.operation}(${right}).ok_or(ProgramError::ArithmeticOverflow)?`
              : `${left} ${sym} ${right}`;
            out.push({ type: "set-field", account: field[1], field: field[2], value });
          } else {
            out.push({ ...op, left, right, result });
          }
          break;
        }
        case "require":
          out.push({ ...op, condition: expr(op.condition) });
          break;
        case "emit-event":
          out.push({ ...op, fields: Object.fromEntries(Object.entries(op.fields).map(([k, v]) => [k, expr(v)])) });
          break;
        case "transfer-sol":
        case "transfer-token":
        case "mint-to":
        case "burn":
          out.push({ ...op, amount: expr(op.amount) });
          break;
        default:
          out.push(op);
      }
    }
    return out;
  };

  return visit(ops);
}
