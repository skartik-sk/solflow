import { router } from "../trpc";
import { workflowRouter } from "./workflow";
import { executionRouter } from "./execution";
import { walletRouter } from "./wallet";
import { nodesRouter } from "./nodes";
import { templateRouter } from "./template";

export const appRouter = router({
  workflow: workflowRouter,
  execution: executionRouter,
  wallet: walletRouter,
  nodes: nodesRouter,
  template: templateRouter,
});

export type AppRouter = typeof appRouter;
