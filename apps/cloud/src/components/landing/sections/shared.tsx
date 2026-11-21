import type { LucideIcon } from "lucide-react";
import { Activity, ArrowRightLeft, Bell, Bot, Clock, Database, FileJson, Filter, GitBranch, Play, Satellite, Send, TrendingUp, Users, Webhook, Zap } from "lucide-react";
import "./shared.css";

/*
 * Shared by the landing's sections: the links the page already used, and the
 * real node set from packages/cloud-nodes (label, category and the icon each
 * definition names), drawn with the editor's node anatomy.
 */

export const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://solstudio.fun";
export const WEB_EDITOR_URL = `${WEB_URL}/dashboard`;
export const CLOUD_DOCS_URL = `${WEB_URL}/docs/cloud`;
export const GITHUB_URL = "https://github.com/skartik-sk/solflow";
export const X_URL = "https://x.com/solstudiodotfun";

export type Cat = "trigger" | "action" | "logic" | "transform" | "ai" | "output";
export type NodeDef = { label: string; cat: Cat; Icon: LucideIcon };

export const NODES = {
  cron: { label: "Cron Trigger", cat: "trigger", Icon: Clock },
  webhook: { label: "Webhook Trigger", cat: "trigger", Icon: Webhook },
  manual: { label: "Manual Trigger", cat: "trigger", Icon: Play },
  priceFetch: { label: "Fetch Price", cat: "action", Icon: TrendingUp },
  pyth: { label: "Pyth Price", cat: "action", Icon: Satellite },
  pythSearch: { label: "Pyth Feed Search", cat: "action", Icon: Satellite },
  switchboard: { label: "Switchboard Price", cat: "action", Icon: Satellite },
  jupSwap: { label: "Jupiter Direct Swap", cat: "action", Icon: ArrowRightLeft },
  jupPrice: { label: "Jupiter Price", cat: "action", Icon: ArrowRightLeft },
  jupOrder: { label: "Jupiter Swap Order", cat: "action", Icon: ArrowRightLeft },
  jupPortfolio: { label: "Jupiter Portfolio", cat: "action", Icon: ArrowRightLeft },
  jupSearch: { label: "Jupiter Token Search", cat: "action", Icon: ArrowRightLeft },
  heliusWallet: { label: "Helius Wallet Activity", cat: "action", Icon: Database },
  metaplexGet: { label: "Metaplex Get Asset", cat: "action", Icon: FileJson },
  squads: { label: "Squads Proposal", cat: "action", Icon: Users },
  jitoBundle: { label: "Jito Send Bundle", cat: "action", Icon: Zap },
  jitoTipAccounts: { label: "Jito Tip Accounts", cat: "action", Icon: Zap },
  jitoTipFloor: { label: "Jito Tip Floor", cat: "action", Icon: Zap },
  telegram: { label: "Telegram Message", cat: "action", Icon: Bell },
  dialect: { label: "Dialect Alert", cat: "action", Icon: Bell },
  transfer: { label: "Token Transfer", cat: "action", Icon: Send },
  ai: { label: "AI Agent", cat: "ai", Icon: Bot },
  ifElse: { label: "If / Else", cat: "logic", Icon: GitBranch },
  filter: { label: "Filter", cat: "transform", Icon: Filter },
  result: { label: "Workflow Result", cat: "output", Icon: FileJson },
  display: { label: "Display Output", cat: "output", Icon: FileJson },
  log: { label: "Run Log", cat: "output", Icon: Activity },
} satisfies Record<string, NodeDef>;

export type NodeId = keyof typeof NODES;

/** The node's icon in its category tile, as the editor draws it. */
export function NodeChip({ id, size = 24 }: { id: NodeId; size?: number }) {
  const n: NodeDef = NODES[id];
  const glyph = size >= 24 ? 14 : 12;
  return (
    <span className="cs-chip" data-cat={n.cat} style={{ width: size, height: size }} aria-hidden>
      <n.Icon size={glyph} strokeWidth={2} />
    </span>
  );
}
