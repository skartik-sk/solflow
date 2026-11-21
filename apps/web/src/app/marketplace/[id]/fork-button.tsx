// apps/web/src/app/marketplace/[id]/fork-button.tsx
// Client component — fork a marketplace template.
// For FREE templates: direct fork via tRPC.
// For PAID templates (not yet purchased): renders PaymentButton.
// For PAID templates (already purchased): direct fork.
// Disabled with tooltip when user is not logged in.

"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { GitFork, LogIn } from "lucide-react";
import { PaymentButton } from "@/components/marketplace/PaymentButton";

interface ForkButtonProps {
  listingId: string;
  pricingModel: string;
  priceSOL: number | null;
  alreadyPurchased: boolean;
  isAuthenticated: boolean;
}

export function ForkButton({
  listingId,
  pricingModel,
  priceSOL,
  alreadyPurchased,
  isAuthenticated,
}: ForkButtonProps) {
  const router = useRouter();

  const fork = trpc.marketplace.fork.useMutation({
    onSuccess: (data) => {
      toast.success("Template forked! Opening editor…");
      router.push(`/editor/${data.projectId}?templateForked=1`);
    },
    onError: (err) => {
      if (err.data?.code === "UNAUTHORIZED") {
        toast.error("Sign in to fork this template");
        router.push("/auth/signin");
      } else {
        toast.error(`Fork failed: ${err.message}`);
      }
    },
  });

  // Not logged in — show disabled button with login prompt
  if (!isAuthenticated) {
    return (
      <button
        onClick={() => router.push("/auth/signin")}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-white/[0.1] bg-secondary px-4 text-[13px] font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[background-color,border-color,transform] duration-150 ease-out hover:border-white/[0.16] hover:bg-accent active:scale-[0.97] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <LogIn className="h-4 w-4" />
        Sign in to fork
      </button>
    );
  }

  // Paid template — delegate to PaymentButton
  if (pricingModel === "PAID" || pricingModel === "PAY_WHAT_YOU_WANT") {
    return (
      <PaymentButton
        listingId={listingId}
        priceSOL={priceSOL ?? 0}
        alreadyPurchased={alreadyPurchased}
      />
    );
  }

  // Free template — direct fork
  return (
    <button
      onClick={() => fork.mutate({ listingId })}
      disabled={fork.isPending}
      className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <GitFork className="h-4 w-4" />
      {fork.isPending ? "Forking…" : "Fork template"}
    </button>
  );
}
