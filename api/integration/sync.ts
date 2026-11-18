import { desc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { integrationSettings, syncItems, syncRuns, type IntegrationSettings } from "@db/schema";
import { getBsaleStocks, type BsaleStock } from "./bsale";
import { getIntegrationConfig, type SyncMode } from "./config";
import { calculateTargetStock, parseSkuAllowlist, planBulkInventory, safeErrorMessage, skuMatches } from "./inventory";
import {
  demoWalmartAmount,
  getWalmartInventory,
  getWalmartInventoryCatalog,
  getWalmartInventoryCatalogForSkus,
  updateWalmartInventory,
  updateWalmartInventoryBulk,
} from "./walmart";

let syncInProgress = false;

type Counters = { total: number; updated: number; unchanged: number; failed: number };
type SyncItemInsert = typeof syncItems.$inferInsert;
type Db = ReturnType<typeof getDb>;

async function insertItems(db: Db, items: SyncItemInsert[]) {
  for (let offset = 0; offset < items.length; offset += 200) {
    await db.insert(syncItems).values(items.slice(offset, offset + 200));
  }
}

async function executeBulkSync({
  mode,
  selected,
  settings,
  runId,
  counters,
  db,
}: {
  mode: Exclude<SyncMode, "simulation">;
  selected: BsaleStock[];
  settings: IntegrationSettings;
  runId: number;
  counters: Counters;
  db: Db;
}): Promise<string> {
  const shipNode = settings.walmartShipNode || undefined;
  let catalog;
  let usedIndividualFallback = false;
  const readFailures = new Map<string, unknown>();
  try {
    catalog = await getWalmartInventoryCatalog(mode);
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
    usedIndividualFallback = true;
    const fallback = await getWalmartInventoryCatalogForSkus(
      mode,
      selected.map((stock) => stock.sku),
      shipNode,
    );
    catalog = fallback.catalog;
    for (const [sku, reason] of fallback.failures) readFailures.set(sku, reason);
  }
  const plans = planBulkInventory(selected, catalog, settings.safetyStock, shipNode).map((plan) => {
    const reason = readFailures.get(plan.stock.sku);
    if (!reason) return plan;
    const typedError = reason as { code?: string; status?: number; correlationId?: string };
    return {
      ...plan,
      status: "failed" as const,
      errorCode: typedError.code || (typedError.status ? `HTTP_${typedError.status}` : "WALMART_READ_ERROR"),
      errorMessage: safeErrorMessage(reason),
      correlationId: typedError.correlationId,
    };
  });
  const fallbackNote = usedIndividualFallback
    ? " La lectura general no estuvo disponible; se comparó cada SKU individualmente."
    : "";
  counters.total = plans.length;

  const unchanged = plans.filter((plan) => plan.status === "unchanged");
  const changes = plans.filter((plan) => plan.status === "pending");
  const failures = plans.filter((plan) => plan.status === "failed");
  counters.unchanged = unchanged.length;
  counters.failed = failures.length;

  await insertItems(
    db,
    plans
      .filter((plan) => plan.status !== "pending")
      .map((plan) => ({
        runId,
        sku: plan.stock.sku,
        bsaleStock: plan.stock.available,
        walmartStock: plan.walmartStock,
        targetStock: plan.targetStock,
        status: plan.status as "unchanged" | "failed",
        errorCode: plan.errorCode,
        errorMessage: plan.errorMessage,
      })),
  );

  if (changes.length === 0) {
    return counters.failed === 0
      ? `Sin escrituras: ${counters.unchanged} SKU ya coinciden entre Bsale y Walmart.${fallbackNote}`
      : `No hay diferencias que enviar; ${counters.failed} SKU requieren revisión.${fallbackNote}`;
  }

  try {
    const feed = await updateWalmartInventoryBulk(
      mode,
      changes.map((plan) => ({ sku: plan.stock.sku, amount: plan.targetStock })),
      shipNode,
    );
    counters.updated = changes.length;
    await insertItems(
      db,
      changes.map((plan) => ({
        runId,
        sku: plan.stock.sku,
        bsaleStock: plan.stock.available,
        walmartStock: plan.walmartStock,
        targetStock: plan.targetStock,
        status: "updated",
        correlationId: feed.feedId,
      })),
    );
    return `Feed ${feed.feedId} aceptado por Walmart: ${changes.length} cambio(s) enviados, ${counters.unchanged} sin cambios y ${counters.failed} fallidos.${fallbackNote}`;
  } catch (error) {
    counters.failed += changes.length;
    const typedError = error as { code?: string; status?: number; correlationId?: string };
    await insertItems(
      db,
      changes.map((plan) => ({
        runId,
        sku: plan.stock.sku,
        bsaleStock: plan.stock.available,
        walmartStock: plan.walmartStock,
        targetStock: plan.targetStock,
        status: "failed",
        errorCode: typedError.code || (typedError.status ? `HTTP_${typedError.status}` : "WALMART_FEED_ERROR"),
        errorMessage: safeErrorMessage(error),
        correlationId: typedError.correlationId,
      })),
    );
    return `Walmart rechazó el lote de ${changes.length} cambio(s); no se confirmó ninguna actualización del feed.${fallbackNote}`;
  }
}

export async function getSettings() {
  const db = getDb();
  const existing = await db.select().from(integrationSettings).where(eq(integrationSettings.id, 1)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(integrationSettings).values({ id: 1 }).onDuplicateKeyUpdate({ set: { id: 1 } });
  const created = await db.select().from(integrationSettings).where(eq(integrationSettings.id, 1)).limit(1);
  return created[0];
}

export type ExecuteSyncInput = {
  mode: SyncMode;
  trigger?: "manual" | "scheduled" | "retry";
  requestedSku?: string;
  retrySkus?: string[];
  productionConfirmed?: boolean;
};

export async function executeSync(input: ExecuteSyncInput) {
  if (syncInProgress) throw new Error("Ya hay una sincronización en curso. Espera a que termine.");
  const config = getIntegrationConfig();
  if (input.mode === "production") {
    if (!config.allowWalmartWrites) throw new Error("Las escrituras reales están bloqueadas. Configura ALLOW_WALMART_WRITES=true.");
    if (input.trigger !== "scheduled" && !input.productionConfirmed) {
      throw new Error("La actualización real requiere confirmar expresamente la operación.");
    }
  }

  syncInProgress = true;
  const db = getDb();
  const settings = await getSettings();
  const [{ id: runId }] = await db
    .insert(syncRuns)
    .values({ mode: input.mode, trigger: input.trigger || "manual", status: "running" })
    .$returningId();
  const startedAt = Date.now();
  const counters: Counters = { total: 0, updated: 0, unchanged: 0, failed: 0 };

  try {
    if (input.mode !== "simulation" && !settings.bsaleOfficeId) {
      throw new Error("Configura el ID de la sucursal de Bsale antes de sincronizar.");
    }
    const source = await getBsaleStocks(input.mode, settings.bsaleOfficeId || undefined);
    const allowlist = input.retrySkus?.length ? new Set(input.retrySkus) : parseSkuAllowlist(settings.skuAllowlist);
    const selected = source.filter((item) => skuMatches(item.sku, allowlist, input.requestedSku));
    counters.total = selected.length;

    if (input.requestedSku && selected.length === 0) {
      throw new Error(`El SKU ${input.requestedSku} no aparece en el stock de Bsale para la sucursal configurada.`);
    }

    let resultMessage: string | undefined;
    if (input.mode !== "simulation" && !input.requestedSku && selected.length > 0) {
      resultMessage = await executeBulkSync({ mode: input.mode, selected, settings, runId, counters, db });
    } else {
      for (const stock of selected) {
        const targetStock = calculateTargetStock(stock.available, settings.safetyStock);
        let walmartStock: number | null = null;
        try {
          if (input.mode === "simulation") {
            walmartStock = demoWalmartAmount(stock.sku);
            if (walmartStock === null) {
              throw Object.assign(new Error("El SKU no existe en el catálogo simulado de Walmart. Revisa la equivalencia de SKU."), {
                code: "WALMART_SKU_NOT_FOUND",
              });
            }
          } else {
            const current = await getWalmartInventory(input.mode, stock.sku, settings.walmartShipNode || undefined);
            walmartStock = current.amount;
            if (walmartStock === null || !Number.isFinite(walmartStock)) {
              throw new Error("Walmart respondió sin una cantidad de inventario reconocible.");
            }
          }

          if (walmartStock === targetStock) {
            counters.unchanged += 1;
            await db.insert(syncItems).values({
              runId,
              sku: stock.sku,
              bsaleStock: stock.available,
              walmartStock,
              targetStock,
              status: "unchanged",
            });
            continue;
          }

          let correlationId: string | undefined;
          if (input.mode !== "simulation") {
            const updated = await updateWalmartInventory(
              input.mode,
              stock.sku,
              targetStock,
              settings.walmartShipNode || undefined,
            );
            correlationId = updated.correlationId;
          }
          counters.updated += 1;
          await db.insert(syncItems).values({
            runId,
            sku: stock.sku,
            bsaleStock: stock.available,
            walmartStock,
            targetStock,
            status: input.mode === "simulation" ? "simulated" : "updated",
            correlationId,
          });
        } catch (error) {
          counters.failed += 1;
          const typedError = error as { code?: string; status?: number; correlationId?: string };
          await db.insert(syncItems).values({
            runId,
            sku: stock.sku,
            bsaleStock: stock.available,
            walmartStock,
            targetStock,
            status: "failed",
            errorCode: typedError.code || (typedError.status ? `HTTP_${typedError.status}` : "SYNC_ITEM_ERROR"),
            errorMessage: safeErrorMessage(error),
            correlationId: typedError.correlationId,
          });
        }
      }
    }

    const status = counters.failed > 0 ? (counters.updated + counters.unchanged > 0 ? "warning" : "error") : "success";
    const message =
      counters.total === 0
        ? "No hay SKU que coincidan con los filtros configurados."
        : resultMessage ||
          (input.mode === "simulation"
            ? `Simulación terminada: ${counters.updated} cambio(s) calculado(s), sin escribir en Walmart.`
            : `Sincronización terminada: ${counters.updated} SKU actualizados, ${counters.unchanged} sin cambios y ${counters.failed} fallidos.`);
    await db
      .update(syncRuns)
      .set({ ...counters, status, message, durationMs: Date.now() - startedAt, finishedAt: new Date() })
      .where(eq(syncRuns.id, runId));
  } catch (error) {
    await db
      .update(syncRuns)
      .set({
        ...counters,
        status: "error",
        message: safeErrorMessage(error),
        durationMs: Date.now() - startedAt,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, runId));
  } finally {
    syncInProgress = false;
  }

  const run = await db.select().from(syncRuns).where(eq(syncRuns.id, runId)).limit(1);
  return run[0];
}

export async function retryFailedItems(runId: number, productionConfirmation?: string) {
  const db = getDb();
  const original = await db.select().from(syncRuns).where(eq(syncRuns.id, runId)).limit(1);
  if (!original[0]) throw new Error("La ejecución indicada no existe.");
  const failed = await db.select().from(syncItems).where(eq(syncItems.runId, runId));
  const retrySkus = failed.filter((item) => item.status === "failed").map((item) => item.sku);
  if (retrySkus.length === 0) throw new Error("Esta ejecución no tiene SKU fallidos para reintentar.");
  if (original[0].mode === "production") {
    if (retrySkus.length !== 1 || productionConfirmation !== `ACTUALIZAR ${retrySkus[0]}`) {
      throw new Error(`Para reintentar producción confirma exactamente: ACTUALIZAR ${retrySkus[0]}`);
    }
  }
  return executeSync({
    mode: original[0].mode,
    trigger: "retry",
    retrySkus,
    productionConfirmed: original[0].mode === "production",
  });
}

export async function recentRuns(limit = 12) {
  return getDb().select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit);
}

export function isSyncRunning() {
  return syncInProgress;
}
