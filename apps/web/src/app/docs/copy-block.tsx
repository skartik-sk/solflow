"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";

export function CopyBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="relative group my-6 overflow-hidden rounded-lg border border-border/60 bg-card">
      {(lang || true) && (
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {lang || "bash"}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="Copy code"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-foreground/90 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function CopyInline({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="relative mt-2 rounded-md border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between">
        <code className="block overflow-x-auto px-3 py-2 font-mono text-xs text-foreground flex-1">
          {code}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 px-2.5 py-2 border-l border-border text-muted-foreground/60 hover:text-foreground transition-colors"
          aria-label="Copy command"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
}
