// Combined appRouter — per docs/architecture/17-api-design.md.

import { router } from "../trpc";
import { projectRouter } from "./project";
import { compileRouter } from "./compile";
import { deployRouter } from "./deploy";
import { testRouter } from "./test";
import { auditRouter } from "./audit";
import { marketplaceRouter } from "./marketplace";
import { userRouter } from "./user";
import { snapshotRouter } from "./snapshot";
import { sdkRouter } from "./sdk";

export const appRouter = router({
  project: projectRouter,
  compile: compileRouter,
  deploy: deployRouter,
  test: testRouter,
  audit: auditRouter,
  marketplace: marketplaceRouter,
  user: userRouter,
  snapshot: snapshotRouter,
  sdk: sdkRouter,
});

export type AppRouter = typeof appRouter;
