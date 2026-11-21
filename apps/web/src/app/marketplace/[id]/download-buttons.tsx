"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

const FRAMEWORKS = [
  { id: "anchor", label: "Anchor" },
  { id: "pinocchio", label: "Pinocchio" },
  { id: "quasar", label: "Quasar" },
] as const;

export function DownloadButtons({ listingId }: { listingId: string }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleDownload(framework: string) {
    setLoading(framework);
    try {
      const res = await fetch(`/api/download/marketplace/${listingId}?framework=${framework}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Download failed" }));
        alert(err.error || "Download failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${framework}-template.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {FRAMEWORKS.map((fw) => (
        <button
          key={fw.id}
          onClick={() => handleDownload(fw.id)}
          disabled={loading !== null}
          className="flex h-8 min-w-[88px] flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-white/[0.08] bg-background/60 px-2 text-[12px] font-medium text-foreground transition-[background-color,border-color,transform] duration-150 ease-out hover:border-white/[0.14] hover:bg-secondary active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {loading === fw.id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3 text-muted-foreground" />
          )}
          {fw.label}
        </button>
      ))}
    </div>
  );
}
