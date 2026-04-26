import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { encryptPrivateKey } from "@solflow/cloud-wallet";
import { Keypair } from "@solana/web3.js";
import { cloudWalletPublicSelect } from "../public-selects";

export const walletRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.cloudWallet.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      select: cloudWalletPublicSelect,
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(50),
        network: z.enum(["mainnet", "devnet"]).default("devnet"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKey) throw new Error("ENCRYPTION_MASTER_KEY not configured");

      const keypair = Keypair.generate();
      const encrypted = encryptPrivateKey(keypair.secretKey, masterKey);

      return ctx.prisma.cloudWallet.create({
        data: {
          user: { connect: { id: ctx.session.user.id } },
          label: input.label,
          publicKey: keypair.publicKey.toBase58(),
          encryptedKey: encrypted.encrypted,
          keyIv: encrypted.iv,
          keyTag: encrypted.tag,
          keySalt: encrypted.salt,
          network: input.network,
        },
        select: cloudWalletPublicSelect,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.cloudWallet.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) throw new Error("Wallet not found");

      return ctx.prisma.cloudWallet.delete({
        where: { id: input.id },
        select: cloudWalletPublicSelect,
      });
    }),
});
