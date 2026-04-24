// Tailwind CSS safelist for standalone build.
// This file ensures all classes used by flow-nodes and editor components
// are included in the compiled CSS output.
// MUST be imported from page.tsx so Tailwind scans it.

// Hidden element that uses all the classes Tailwind needs to generate.
// This is the most reliable approach for Tailwind v4.
// The element is never rendered (display:none).
export const _safelist = (
  <span
    className="
      text-[9px] text-[10px] text-[11px]
      min-w-[200px] max-w-[60px] max-w-[80px] max-w-[110px] max-w-[120px]
      w-[200px] w-[260px]
      shadow-black/30 shadow-black/40 shadow-primary/20
      bg-violet-500/15 bg-violet-500/20
      bg-green-500/10 bg-green-500/20 bg-green-500/30
      bg-red-500/5 bg-red-500/10 bg-red-500/30
      bg-blue-500/20
      bg-emerald-500/20
      bg-orange-500/10 bg-orange-500/30
      bg-yellow-500/10 bg-yellow-500/30
      bg-destructive/10 bg-primary/10 bg-primary/90
      bg-muted/50 bg-muted/30 bg-muted/80 bg-accent/50
      border-border/40 border-border/80
      border-green-500/20 border-green-500/30 border-green-500/40
      border-red-500/20 border-red-500/30 border-red-500/40
      text-muted-foreground/30 text-muted-foreground/40
      text-muted-foreground/50 text-muted-foreground/60 text-muted-foreground/70
      text-foreground/80
      space-y-0.5 space-y-1 space-y-1.5 space-y-2 space-y-3 space-y-4
      rounded-t-xl
      tracking-wider
      whitespace-pre-wrap
      divide-border
      scrollbar-hide
      active:cursor-grabbing
      hover:bg-muted/80
      pl-7 pr-6 h-3 w-3
    "
    style={{ display: "none" }}
  />
);
