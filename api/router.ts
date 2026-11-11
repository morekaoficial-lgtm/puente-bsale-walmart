import { createRouter, publicQuery } from "./middleware";
import { integrationRouter } from "./integrationRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  integration: integrationRouter,
});

export type AppRouter = typeof appRouter;
