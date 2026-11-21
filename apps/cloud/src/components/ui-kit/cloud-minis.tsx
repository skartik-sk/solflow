/**
 * Still miniatures of Cloud's own UI for empty states. Decorative only
 * (the EmptyPanel marks them aria-hidden); real controls stay in the page.
 */

import { Clock, KeyRound, Lock, Play, RotateCcw, Satellite, Wallet, CheckCircle2 } from "lucide-react";
import { MiniNode, NODE_HUE } from "./cloud-ui";

const IC = "h-3 w-3";

function Wire() {
  return <span className="h-px w-6 shrink-0 bg-white/20" />;
}

/** The starter workflow NewWorkflowDialog creates: Manual Trigger → Jupiter Price → Workflow Result. */
export function WorkflowMini() {
  return (
    <div className="flex items-center [mask-image:linear-gradient(90deg,#000_75%,transparent)]">
      <MiniNode icon={<Play className={IC} />} label="Manual Trigger" value="Run once" color={NODE_HUE.trigger} state="ok" />
      <Wire />
      <MiniNode icon={<Satellite className={IC} />} label="Jupiter Price" value="So11…1112" color={NODE_HUE.action} state="ok" />
      <Wire />
      <MiniNode icon={<CheckCircle2 className={IC} />} label="Workflow Result" value="{{ $json.jupiter }}" color={NODE_HUE.output} />
    </div>
  );
}

/** A short run list, newest first, fading out at its foot. */
export function RunsMini() {
  const rows = [
    { name: "SOL dip buyer", trig: "Cron", st: "Completed", tone: "text-emerald-400", dur: "2.4s" },
    { name: "SOL dip buyer", trig: "Replay", st: "Completed", tone: "text-emerald-400", dur: "2.1s" },
    { name: "Wallet watch", trig: "Webhook", st: "Running", tone: "text-primary", dur: "–" },
  ];
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-[12px] bg-popover shadow-[0_0_0_1px_rgba(255,255,255,0.09),0_16px_40px_-16px_rgba(0,0,0,0.8)] [mask-image:linear-gradient(180deg,#000_60%,transparent)]">
      {rows.map((r, i) => (
        <div key={i} className="flex h-11 items-center gap-3 border-b border-white/[0.06] px-3.5 text-[12px] last:border-b-0">
          <span className={`flex w-[84px] shrink-0 items-center gap-1.5 ${r.tone}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {r.st}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground">{r.name}</span>
          <span className="hidden text-muted-foreground sm:inline">{r.trig}</span>
          <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">{r.dur}</span>
          {i === 0 && <RotateCcw className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
      <div className="flex h-11 items-center gap-3 px-3.5">
        <span className="h-1.5 w-16 rounded bg-white/10" />
        <span className="h-1.5 w-28 rounded bg-white/[0.06]" />
      </div>
    </div>
  );
}

/** Stored credentials: label, provider and a masked value. Never a real-looking key. */
export function KeysMini() {
  const rows = [
    { label: "Jupiter API key", type: "jupiter" },
    { label: "Helius RPC", type: "helius" },
    { label: "Alerts bot", type: "telegram" },
  ];
  return (
    <div className="w-full max-w-[400px] overflow-hidden rounded-[12px] bg-popover shadow-[0_0_0_1px_rgba(255,255,255,0.09),0_16px_40px_-16px_rgba(0,0,0,0.8)]">
      {rows.map((r) => (
        <div key={r.label} className="flex h-11 items-center gap-2.5 border-b border-white/[0.06] px-3.5 text-[12px]">
          <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-foreground">{r.label}</span>
          <span className="text-muted-foreground">{r.type}</span>
          <span className="font-mono tracking-[0.12em] text-muted-foreground/70">••••••</span>
        </div>
      ))}
      <div className="flex h-10 items-center gap-2 px-3.5 text-[11.5px] text-muted-foreground">
        <Lock className="h-3 w-3" />
        AES-256-GCM, server side
      </div>
    </div>
  );
}

/** A cloud wallet as the list shows it: label, short address, network. */
export function WalletMini() {
  return (
    <div className="w-full max-w-[400px] space-y-2">
      <div className="flex h-12 items-center gap-3 rounded-[12px] bg-popover px-3.5 text-[12px] shadow-[0_0_0_1px_rgba(255,255,255,0.09),0_16px_40px_-16px_rgba(0,0,0,0.8)]">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Wallet className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-foreground">Bot wallet</span>
          <span className="block font-mono text-[11px] text-muted-foreground">7xKX…9fQ2</span>
        </span>
        <span className="rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[11px] text-muted-foreground">devnet</span>
      </div>
      <div className="ml-6 flex h-10 items-center gap-2.5 rounded-[10px] bg-popover/70 px-3.5 text-[11.5px] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
        <Clock className="h-3 w-3" />
        Signs for Jupiter Swap, max 0.5 SOL per run
      </div>
    </div>
  );
}
