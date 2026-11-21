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
import { resolveFloatingBrowserTarget } from "@/lib/floating-browser-policy";

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
  const [openUrl, setOpenUrl] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [isFrameLoading, setIsFrameLoading] = useState(false);

  // Position & size — default to 75% of viewport
  const [pos, setPos] = useState({ x: 0, y: 40 });
  const [size, setSize] = useState({ w: 720, h: 520 });
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0 });

  // Center on first open
  useEffect(() => {
    if (isOpen && url) {
      const target = resolveFloatingBrowserTarget(url, window.location.origin);
      const w = Math.round(window.innerWidth * 0.75);
      const h = Math.round(window.innerHeight * 0.75);
      setSize({ w, h });
      const cx = Math.max(20, (window.innerWidth - w) / 2);
      const cy = Math.max(20, (window.innerHeight - h) / 2);
      setPos({ x: cx, y: cy });
      if (target) {
        setCurrentUrl(target.frameSrc);
        setInputUrl(target.displayUrl);
        setOpenUrl(target.openUrl);
        setBlocked(!target.canEmbed);
        setIsFrameLoading(target.canEmbed);
        setIframeKey((k) => k + 1);
      }
    }
  }, [isOpen, url]);

  useEffect(() => {
    if (!isOpen || !currentUrl || blocked || !isFrameLoading) return;
    const timer = window.setTimeout(() => {
      setBlocked(true);
      setIsFrameLoading(false);
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [blocked, currentUrl, iframeKey, isFrameLoading, isOpen]);

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
    const resolved = resolveFloatingBrowserTarget(target, window.location.origin);
    if (!resolved) return;
    setCurrentUrl(resolved.frameSrc);
    setInputUrl(resolved.displayUrl);
    setOpenUrl(resolved.openUrl);
    setBlocked(!resolved.canEmbed);
    setIsFrameLoading(resolved.canEmbed);
    setIframeKey((k) => k + 1);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(inputUrl);
  };

  const refresh = () => {
    navigate(inputUrl || currentUrl);
  };

  const openExternal = () => {
    window.open(openUrl || currentUrl, "_blank", "noopener,noreferrer");
  };

  if (!isOpen) return null;

  // ─── Minimized pill ───────────────────────────────────────────────────
  if (isMinimized) {
    return (
      <button
        onClick={restore}
        className="fixed bottom-4 right-4 z-[60] flex h-10 items-center gap-2 rounded-[10px] border border-white/[0.08] bg-popover px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_40px_-16px_rgba(0,0,0,0.85)] transition-[background-color,transform] duration-150 ease-out hover:bg-[#1b1e23] active:scale-[0.97] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <Globe size={13} className="text-primary" />
        <span className="max-w-[200px] truncate text-[12px] font-medium">
          {title || "Browser"}
        </span>
        <span className="text-[11px] text-muted-foreground">click to restore</span>
      </button>
    );
  }

  // ─── Full window ──────────────────────────────────────────────────────
  return (
    <div
      className="fixed z-[60] flex flex-col overflow-hidden rounded-[14px] border border-white/[0.08] bg-popover shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_32px_80px_-24px_rgba(0,0,0,0.85)]"
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
        className="flex h-9 shrink-0 cursor-grab select-none items-center gap-2 border-b border-white/[0.06] pl-3 pr-1.5 active:cursor-grabbing"
      >
        <Globe size={13} className="text-primary shrink-0" />
        <span className="flex-1 truncate text-[12px] font-medium text-foreground/85">
          {title || "Browser"}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={minimize}
            title="Minimize"
            aria-label="Minimize browser"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={openExternal}
            title="Open in new tab"
            aria-label="Open in new tab"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <ExternalLink size={12} />
          </button>
          <button
            onClick={close}
            title="Close (Esc)"
            aria-label="Close browser"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-red-500/10 hover:text-red-400 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* ── URL bar ────────────────────────────────────────────────── */}
      <form
        onSubmit={handleUrlSubmit}
        className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-card px-1.5"
      >
        <button
          type="button"
          onClick={() => refresh()}
          title="Refresh"
          aria-label="Refresh"
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        >
          <RefreshCw size={11} />
        </button>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="Enter URL..."
          aria-label="URL"
          className="h-6 flex-1 rounded-md border border-white/[0.08] bg-background/60 px-2 font-mono text-[12px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground/50 hover:border-white/[0.14] focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
        />
      </form>

      {/* ── Quick links ────────────────────────────────────────────── */}
      <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-white/[0.06] bg-card px-1.5 scrollbar-hide [scrollbar-width:none]">
        {QUICK_LINKS.map((link) => (
          <button
            key={link.label}
            onClick={() => navigate(link.url)}
            title={link.label}
            className="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            {link.icon}
            {link.label}
          </button>
        ))}
      </div>

      {/* ── iframe / content ───────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden bg-background">
        {!currentUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
            <Globe size={20} className="text-muted-foreground/50" />
            <p className="text-[13px] text-muted-foreground">Enter a URL to browse</p>
          </div>
        ) : blocked ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
            <Globe size={20} className="text-muted-foreground/50" />
            <p className="text-[13px] text-muted-foreground">
              This page can&apos;t be shown inside SolStudio
            </p>
            <button
              onClick={openExternal}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[background-color,transform] duration-150 ease-out hover:bg-[#7fe0e6] active:scale-[0.97] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            >
              <ExternalLink size={12} />
              Open in new tab
            </button>
          </div>
        ) : (
          <>
            <iframe
              key={iframeKey}
              src={currentUrl}
              className="h-full w-full border-0 bg-background"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              onError={() => {
                setBlocked(true);
                setIsFrameLoading(false);
              }}
              onLoad={() => setIsFrameLoading(false)}
              title="Floating browser"
            />
            {isFrameLoading ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background">
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <RefreshCw size={13} className="animate-spin" />
                  Loading
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ── Resize handle ──────────────────────────────────────────── */}
      <div
        onMouseDown={onResizeDown}
        className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
        style={{
          background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.14) 50%)",
          borderRadius: "0 0 14px 0",
        }}
      />
    </div>
  );
}
