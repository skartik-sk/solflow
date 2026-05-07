// User profile, settings, and wallet-linking router.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { consumeNonce, verifyNonce } from "@solflow/auth";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        walletAddress: true,
        createdAt: true,
      },
    });
  }),

  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: input,
        select: { id: true, name: true },
      });
    }),

  // ── linkWallet: link a Solana wallet to the current OAuth account ──
  linkWallet: protectedProcedure
    .input(
      z.object({
        publicKey: z.string().min(32),
        signature: z.string().min(1),
        message: z.string().min(1),
        nonce: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { publicKey, signature, message, nonce } = input;

      const messageHasLine = (expected: string) =>
        message.split(/\r?\n/).some((line) => line.trim() === expected);

      if (!(await verifyNonce(nonce))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nonce mismatch" });
      }

      // Reject if message is suspiciously long (limits attack surface)
      if (message.length > 512) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Message too long" });
      }
      if (!messageHasLine(publicKey) || !messageHasLine(`Nonce: ${nonce}`)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Message mismatch" });
      }

      // Verify Ed25519 signature
      try {
        const pubkey = new PublicKey(publicKey);
        const msgBytes = new TextEncoder().encode(message);
        const sigBytes = bs58.decode(signature);
        const verified = nacl.sign.detached.verify(
          msgBytes,
          sigBytes,
          pubkey.toBytes(),
        );
        if (!verified) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid signature",
          });
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid public key or signature",
        });
      }

      if (!(await consumeNonce(nonce))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nonce already used" });
      }

      // Check the wallet isn't already linked to a different account
      const existing = await ctx.prisma.user.findUnique({
        where: { walletAddress: publicKey },
        select: { id: true },
      });
      if (existing && existing.id !== ctx.session.user.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Wallet already linked to another account",
        });
      }

      // Link wallet
      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { walletAddress: publicKey },
      });

      return { success: true };
    }),

  // ── unlinkWallet: remove wallet link from account ──────────────────
  unlinkWallet: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.session.user.id },
      data: { walletAddress: null },
    });
    return { success: true };
  }),
});
