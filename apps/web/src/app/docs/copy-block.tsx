"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Check, Copy } from "lucide-react";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return { copied, copy };
}

/** Swaps copy for check in place, with a short blur crossfade. */
function CopyGlyph({ copied }: { copied: boolean }) {
  const base =
    "absolute h-3.5 w-3.5 transition-[opacity,transform,filter] duration-150 ease-out motion-reduce:transition-none";
  return (
    <span className="relative grid h-3.5 w-3.5 place-items-center" aria-hidden>
      <Copy className={`${base} ${copied ? "scale-90 opacity-0 blur-[2px]" : "opacity-100"}`} />
      <Check className={`${base} text-primary ${copied ? "opacity-100" : "scale-90 opacity-0 blur-[2px]"}`} />
    </span>
  );
}

export function CopyBlock({ code, lang }: { code: string; lang?: string }) {
  const { copied, copy } = useCopy(code);

  return (
    <div className="group/code my-5 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0b0c0f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex h-9 items-center justify-between border-b border-white/[0.06] bg-card pr-1.5 pl-4">
        <span className="font-mono text-[11.5px] text-muted-foreground">{lang || "bash"}</span>
        <button
          type="button"
          onClick={copy}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-white/[0.06] hover:text-foreground active:scale-[0.97] ${FOCUS}`}
          aria-label="Copy code"
        >
          <CopyGlyph copied={copied} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-[#d4d6dc]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function CopyInline({ code }: { code: string }) {
  const { copied, copy } = useCopy(code);

  return (
    <div className="relative mt-2 flex items-center overflow-hidden rounded-[10px] border border-white/[0.07] bg-[#0b0c0f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <span aria-hidden className="pl-3 font-mono text-[12.5px] text-primary/80">
        $
      </span>
      <code className="block flex-1 overflow-x-auto px-2.5 py-2 font-mono text-[12.5px] whitespace-nowrap text-foreground">
        {code}
      </code>
      <button
        type="button"
        onClick={copy}
        className={`mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-white/[0.06] hover:text-foreground active:scale-[0.97] ${FOCUS}`}
        aria-label="Copy command"
      >
        <CopyGlyph copied={copied} />
      </button>
    </div>
  );
}
