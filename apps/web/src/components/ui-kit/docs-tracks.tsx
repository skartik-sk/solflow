"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CliMini, CloudMini, VisualMini } from "./docs-minis";

const MINIS = { visual: VisualMini, cli: CliMini, cloud: CloudMini } as const;

export type TrackCard = {
  href: string;
  title: string;
  body: string;
  mini: keyof typeof MINIS;
};

/** Entry cards for the three learn tracks, each led by a product miniature. */
export function DocsTrackCards({ items }: { items: TrackCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const Mini = MINIS[item.mini];
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,transform] duration-150 ease-out hover:border-white/[0.14] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            <div className="border-b border-white/[0.06] bg-background" data-ss-fill>
              <Mini />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <p className="flex items-center gap-1.5 text-[14.5px] font-medium tracking-[-0.01em] text-foreground">
                {item.title}
                <ArrowRight
                  size={14}
                  aria-hidden
                  className="text-muted-foreground transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </p>
              <p className="mt-1.5 text-[13.5px] leading-[1.6] text-muted-foreground">{item.body}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
