import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { syncItems, integrationSettings } from "@db/schema";
import { testBsaleConnection } from "./integration/bsale";
import { publicConnectionState } from "./integration/config";
import { executeSync, getSettings, isSyncRunning, recentRuns, retryFailedItems } from "./integration/sync";
import { testWalmartConnection } from "./integration/walmart";
import { safeErrorMessage } from "./integration/inventory";

const modeSchema = z.enum(["simulation", "sandbox", "production"]);

export const integrationRouter = createRouter({
  dashboard: publicQuery.query(async () => {
    const db = getDb();
    const settings = await getSettings();
    const runs = await recentRuns(12);
    const latestRun = runs[0] || null;
    const latestItems = latestRun
      ? await db.select().from(syncItems).where(eq(syncItems.runId, latestRun.id)).orderBy(desc(syncItems.id)).limit(100)
      : [];
    return {
      connections: publicConnectionState(),
      settings,
      runs,
      latestRun,
      latestItems,
      running: isSyncRunning(),
      serverTime: new Date(),
    };
  }),

  runItems: publicQuery.input(z.object({ runId: z.number().int().positive() })).query(async ({ input }) => {
    return getDb().select().from(syncItems).where(eq(syncItems.runId, input.runId)).orderBy(desc(syncItems.id)).limit(500);
  }),

  updateSettings: publicQuery
    .input(
      z.object({
        bsaleOfficeId: z.string().trim().max(50).nullable(),
        walmartShipNode: z.string().trim().max(100).nullable(),
        safetyStock: z.number().int().min(0).max(1_000_000),
        intervalMinutes: z.number().int().min(1).max(1440),
        autoSyncEnabled: z.boolean(),
        skuAllowlist: z.string().max(20_000).nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      await getSettings();
      await getDb()
        .update(integrationSettings)
        .set({
          bsaleOfficeId: input.bsaleOfficeId || null,
          walmartShipNode: input.walmartShipNode || null,
          safetyStock: input.safetyStock,
          intervalMinutes: input.intervalMinutes,
          autoSyncEnabled: input.autoSyncEnabled,
          skuAllowlist: input.skuAllowlist || null,
          updatedAt: new Date(),
        })
        .where(eq(integrationSettings.id, 1));
      return getSettings();
    }),

  runSync: publicQuery
    .input(
      z.object({
        mode: modeSchema.default("simulation"),
        sku: z.string().trim().max(255).optional(),
        productionConfirmation: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.mode === "production" && (!input.sku || input.productionConfirmation !== `ACTUALIZAR ${input.sku}`)) {
        throw new Error("Para producción escribe exactamente: ACTUALIZAR <SKU>");
      }
      return executeSync({
        mode: input.mode,
        requestedSku: input.sku || undefined,
        productionConfirmed: input.mode === "production",
      });
    }),

  retryRun: publicQuery
    .input(z.object({ runId: z.number().int().positive(), productionConfirmation: z.string().optional() }))
    .mutation(async ({ input }) => {
      return retryFailedItems(input.runId, input.productionConfirmation);
    }),

  testConnections: publicQuery.mutation(async () => {
    const [bsale, walmart] = await Promise.allSettled([testBsaleConnection(), testWalmartConnection()]);
    return {
      bsale:
        bsale.status === "fulfilled"
          ? { ok: true, detail: bsale.value.detail }
          : { ok: false, detail: safeErrorMessage(bsale.reason) },
      walmart:
        walmart.status === "fulfilled"
          ? { ok: true, detail: walmart.value.detail }
          : { ok: false, detail: safeErrorMessage(walmart.reason) },
    };
  }),
});
