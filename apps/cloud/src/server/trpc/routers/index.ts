import { router } from "../trpc";
import { workflowRouter } from "./workflow";
import { executionRouter } from "./execution";
import { walletRouter } from "./wallet";
import { credentialRouter } from "./credential";
import { nodesRouter } from "./nodes";
import { templateRouter } from "./template";

export const appRouter = router({
  workflow: workflowRouter,
  execution: executionRouter,
  wallet: walletRouter,
  credential: credentialRouter,
  nodes: nodesRouter,
  template: templateRouter,
});

export type AppRouter = typeof appRouter;
