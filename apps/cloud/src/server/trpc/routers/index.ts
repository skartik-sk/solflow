import { router } from "../trpc";
import { workflowRouter } from "./workflow";
import { executionRouter } from "./execution";
import { walletRouter } from "./wallet";
import { nodesRouter } from "./nodes";

export const appRouter = router({
  workflow: workflowRouter,
  execution: executionRouter,
  wallet: walletRouter,
  nodes: nodesRouter,
});

export type AppRouter = typeof appRouter;
