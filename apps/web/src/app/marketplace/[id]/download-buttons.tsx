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
    <div className="flex flex-col gap-2">
      {FRAMEWORKS.map((fw) => (
        <button
          key={fw.id}
          onClick={() => handleDownload(fw.id)}
          disabled={loading !== null}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === fw.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {fw.label}
        </button>
      ))}
    </div>
  );
}
