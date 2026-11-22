// apps/web/src/lib/marketplace/access.ts
// Single gate for "may this user get the template contents of a listing?"
// A listing is open when it is FREE, when the viewer is its author, or when the
// viewer has a purchase row. Everything that copies or exposes templateFlowData
// / templateIR (get, fork, download, project.create from template) goes
// through here.

import { TRPCError } from "@trpc/server";

export interface AccessListing {
  id: string;
  authorId: string;
  pricingModel: string;
}

interface PurchaseLookup {
  marketplacePurchase: {
    findUnique(args: {
      where: { listingId_buyerId: { listingId: string; buyerId: string } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

/** Paid listings (PAID and PAY_WHAT_YOU_WANT) need a purchase to unlock. */
export function isLockedListing(listing: Pick<AccessListing, "pricingModel">): boolean {
  return listing.pricingModel !== "FREE";
}

export async function canAccessTemplate(
  prisma: PurchaseLookup,
  listing: AccessListing,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!isLockedListing(listing)) return true;
  if (!userId) return false;
  if (listing.authorId === userId) return true;
  const purchase = await prisma.marketplacePurchase.findUnique({
    where: { listingId_buyerId: { listingId: listing.id, buyerId: userId } },
    select: { id: true },
  });
  return !!purchase;
}

export async function assertCanAccessTemplate(
  prisma: PurchaseLookup,
  listing: AccessListing,
  userId: string | null | undefined,
): Promise<void> {
  if (await canAccessTemplate(prisma, listing, userId)) return;
  throw new TRPCError({
    code: userId ? "FORBIDDEN" : "UNAUTHORIZED",
    message: userId
      ? "This is a paid template. Purchase it to get the source."
      : "Sign in and purchase this template to get the source.",
  });
}

/**
 * Remove the template contents from a listing the viewer can't open.
 * Use before returning a listing to a client (tRPC get, the detail page).
 */
export function redactLockedTemplate<
  T extends { templateFlowData?: unknown; templateIR?: unknown },
>(listing: T, canAccess: boolean): T & { locked: boolean } {
  if (canAccess) return { ...listing, locked: false };
  return { ...listing, templateFlowData: null, templateIR: null, locked: true };
}
