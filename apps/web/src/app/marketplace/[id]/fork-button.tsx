// apps/web/src/app/marketplace/[id]/fork-button.tsx
// Client component — fork a marketplace template.
// For FREE templates: direct fork via tRPC.
// For PAID templates (not yet purchased): renders PaymentButton.
// For PAID templates (already purchased): direct fork.

"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { GitFork } from "lucide-react";
import { PaymentButton } from "@/components/marketplace/PaymentButton";

interface ForkButtonProps {
  listingId: string;
  pricingModel: string;
  priceSOL: number | null;
  alreadyPurchased: boolean;
}

export function ForkButton({
  listingId,
  pricingModel,
  priceSOL,
  alreadyPurchased,
}: ForkButtonProps) {
  const router = useRouter();

  const fork = trpc.marketplace.fork.useMutation({
    onSuccess: (data) => {
      toast.success("Template forked! Opening editor…");
      router.push(`/editor/${data.projectId}`);
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
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      <GitFork className="h-4 w-4" />
      {fork.isPending ? "Forking…" : "Fork Template"}
    </button>
  );
}
