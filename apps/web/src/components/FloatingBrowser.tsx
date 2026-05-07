"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  Minus,
  ExternalLink,
  RefreshCw,
  BookOpen,
  Search,
  Code2,
  Zap,
  Globe,
} from "lucide-react";
import { useFloatingBrowserStore } from "@/store/floating-browser-store";

// ─── Quick links ────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: "Docs", url: "/docs", icon: <BookOpen size={11} /> },
  { label: "Explorer", url: "https://explorer.solana.com", icon: <Search size={11} /> },
  { label: "Anchor Docs", url: "https://www.anchor-lang.com", icon: <Code2 size={11} /> },
  { label: "Solana Docs", url: "https://docs.solanalabs.com", icon: <Zap size={11} /> },
  { label: "Faucet", url: "https://faucet.solana.com", icon: <Globe size={11} /> },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingBrowser() {
  const { isOpen, url, title, isMinimized, close, minimize, restore } =
    useFloatingBrowserStore();
  const [currentUrl, setCurrentUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // Position & size — default to 75% of viewport
  const [pos, setPos] = useState({ x: 0, y: 40 });
  const [size, setSize] = useState({ w: 720, h: 520 });
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0 });

  // Center on first open
  useEffect(() => {
    if (isOpen && url) {
      const w = Math.round(window.innerWidth * 0.75);
      const h = Math.round(window.innerHeight * 0.75);
      setSize({ w, h });
      const cx = Math.max(20, (window.innerWidth - w) / 2);
      const cy = Math.max(20, (window.innerHeight - h) / 2);
      setPos({ x: cx, y: cy });
      setCurrentUrl(url);
      setInputUrl(url);
      setBlocked(false);
      setIframeKey((k) => k + 1);
    }
  }, [isOpen, url]);

  // ─── Drag ──────────────────────────────────────────────────────────────
  const onDragDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMinimized) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    },
    [pos, isMinimized],
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, dragStart.current.px + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, dragStart.current.py + dy)),
      });
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  // ─── Resize ───────────────────────────────────────────────────────────
  const onResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
    },
    [size],
  );

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const dw = e.clientX - resizeStart.current.mx;
      const dh = e.clientY - resizeStart.current.my;
      setSize({
        w: Math.max(400, resizeStart.current.w + dw),
        h: Math.max(300, resizeStart.current.h + dh),
      });
    };
    const onUp = () => setIsResizing(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  // ─── Escape to close ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  // ─── Navigate ─────────────────────────────────────────────────────────
  const navigate = (target: string) => {
    let href = target.trim();
    if (!href) return;
    // Prepend https:// if no protocol
    if (!/^https?:\/\//i.test(href) && !href.startsWith("/")) {
      href = "https://" + href;
    }
    setCurrentUrl(href);
    setInputUrl(href);
    setBlocked(false);
    setIframeKey((k) => k + 1);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(inputUrl);
  };

  const refresh = () => {
    setBlocked(false);
    setIframeKey((k) => k + 1);
  };

  const openExternal = () => {
    window.open(currentUrl, "_blank", "noopener,noreferrer");
  };

  if (!isOpen) return null;

  // ─── Minimized pill ───────────────────────────────────────────────────
  if (isMinimized) {
    return (
      <button
        onClick={restore}
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-2xl shadow-black/40 hover:bg-accent transition-colors"
      >
        <Globe size={14} className="text-primary" />
        <span className="text-xs font-medium max-w-[200px] truncate">
          {title || "Browser"}
        </span>
        <span className="text-[10px] text-muted-foreground">click to restore</span>
      </button>
    );
  }

  // ─── Full window ──────────────────────────────────────────────────────
  return (
    <div
      className="fixed z-[60] flex flex-col rounded-xl border border-border bg-card shadow-2xl shadow-black/50 overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
      }}
    >
      {/* ── Title bar / drag handle ────────────────────────────────── */}
      <div
        onMouseDown={onDragDown}
        className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2 cursor-grab active:cursor-grabbing select-none"
      >
        <Globe size={13} className="text-primary shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground truncate flex-1">
          {title || "Browser"}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={minimize}
            title="Minimize"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={openExternal}
            title="Open in new tab"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ExternalLink size={12} />
          </button>
          <button
            onClick={close}
            title="Close (Esc)"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* ── URL bar ────────────────────────────────────────────────── */}
      <form
        onSubmit={handleUrlSubmit}
        className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-2 py-1.5"
      >
        <button
          type="button"
          onClick={() => refresh()}
          title="Refresh"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <RefreshCw size={11} />
        </button>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="Enter URL..."
          className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-mono text-foreground outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
        />
      </form>

      {/* ── Quick links ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-2 py-1 overflow-x-auto scrollbar-hide">
        {QUICK_LINKS.map((link) => (
          <button
            key={link.label}
            onClick={() => navigate(link.url)}
            title={link.label}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {link.icon}
            {link.label}
          </button>
        ))}
      </div>

      {/* ── iframe / content ───────────────────────────────────────── */}
      <div className="relative flex-1 bg-white overflow-hidden">
        {!currentUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
            <Globe size={32} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Enter a URL to browse</p>
          </div>
        ) : blocked ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
            <Globe size={32} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              This site doesn&apos;t allow embedding
            </p>
            <button
              onClick={openExternal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ExternalLink size={12} />
              Open in new tab
            </button>
          </div>
        ) : (
          <iframe
            key={iframeKey}
            src={currentUrl}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            onError={() => setBlocked(true)}
            title="Floating browser"
          />
        )}
      </div>

      {/* ── Resize handle ──────────────────────────────────────────── */}
      <div
        onMouseDown={onResizeDown}
        className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
        style={{
          background: "linear-gradient(135deg, transparent 50%, oklch(0.4 0.02 240) 50%)",
          borderRadius: "0 0 0.75rem 0",
        }}
      />
    </div>
  );
}
